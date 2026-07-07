import { db } from '../db/index.js';
import { users, roles } from '../db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { AppError, hashPassword, comparePassword, hashInvitationToken } from '@oslsr/utils';
import type { ActivationWithSelfiePayload, BackOfficeActivationPayload, AuthUser, LoginResponse } from '@oslsr/types';
import { UserRole, isBackOfficeRole } from '@oslsr/types';
import { TokenService } from './token.service.js';
import { SessionService } from './session.service.js';
import { PhotoProcessingService } from './photo-processing.service.js';
import { AuditService, AUDIT_ACTIONS } from './audit.service.js';
import { MfaService } from './mfa.service.js';
import { MagicLinkService } from './magic-link.service.js';
import { setReAuthValid, clearReAuth } from '../lib/reauth-grace.js';
import pino from 'pino';

/**
 * Story 9-13 — `loginStaff` returns one of two shapes:
 *   - normal: full session + tokens (when MFA is not required)
 *   - 2-step pending: a short-lived challenge token (when MFA is enrolled)
 *
 * The login controller branches on `requiresMfa` to render the right HTTP
 * response. Tests can discriminate via the same property.
 */
export type StaffLoginResult =
  | (LoginResponse & { refreshToken: string; sessionId: string; requiresMfa?: false })
  | { requiresMfa: true; mfaChallengeToken: string; expiresIn: number };

/**
 * Story 9-16 — `loginByMagicLinkToken` returns the same discriminated union as
 * `loginStaff`: either a full session (no MFA) or a 2-step challenge (MFA
 * enrolled). The magic-link login controller branches on `requiresMfa`.
 */
export type MagicLinkLoginResult =
  | (LoginResponse & { refreshToken: string; sessionId: string; requiresMfa?: false })
  | { requiresMfa: true; mfaChallengeToken: string; expiresIn: number };

/**
 * Story 9-16 — distinguishes the auth channel that minted a login session so
 * the Story 9-11 audit-log viewer can filter password vs magic-link logins.
 * Threaded into `createLoginSession`'s single login-success audit entry rather
 * than emitting a second entry (avoids double-logging one login event).
 */
export type LoginTrigger = 'password' | 'magic_link';

const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;

const logger = pino({ name: 'auth-service' });

// Login attempt tracking constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const EXTENDED_LOCKOUT_THRESHOLD = 10;

/**
 * Story 13-18 AC4 (PM ruling 2026-07-06) — a successful INTERACTIVE PASSWORD
 * login grants the same 5-minute re-auth grace as `POST /auth/reauth`: the
 * user just proved their password, so step-up-gated actions shouldn't
 * re-prompt seconds later. Applied on staff login, public login, and MFA
 * step-2 completion (password was proven at step 1). Deliberately NOT applied
 * on silent token refresh or magic-link login (neither is a password proof).
 *
 * Non-fatal by design: the grace is a UX nicety — a Redis blip must never
 * fail a login (worst case the user sees the re-auth modal, i.e. the
 * pre-grace behaviour).
 */
async function grantLoginReAuthGrace(userId: string): Promise<void> {
  try {
    await setReAuthValid(userId);
  } catch (error) {
    logger.warn({
      event: 'auth.login_reauth_grace_failed',
      userId,
      error: (error as Error).message,
    });
  }
}

export class AuthService {
  /**
   * Validates an activation token without consuming it.
   * Returns user info if valid, or specific error states.
   * @param token Secure invitation token
   */
  static async validateActivationToken(token: string): Promise<{
    valid: boolean;
    email?: string;
    fullName?: string;
    expired?: boolean;
    roleName?: string;
  }> {
    // OPS-2 (Story 9-42 AC#11): the column stores sha256(token); hash the
    // incoming plaintext before lookup so the raw token is never compared.
    const user = await db.query.users.findFirst({
      where: eq(users.invitationToken, hashInvitationToken(token)),
      with: {
        role: true,
      },
    });

    if (!user) {
      return { valid: false, expired: false };
    }

    if (user.status !== 'invited') {
      // Already activated
      return { valid: false, expired: false };
    }

    // Check expiry (24 hours)
    if (user.invitedAt) {
      const expiryDate = new Date(user.invitedAt);
      expiryDate.setHours(expiryDate.getHours() + 24);
      if (new Date() > expiryDate) {
        return { valid: false, expired: true };
      }
    }

    return {
      valid: true,
      email: user.email,
      fullName: user.fullName,
      roleName: user.role.name,
    };
  }

  /**
   * Activates a staff account using an invitation token.
   * @param token Secure invitation token
   * @param data Profile data, password, and optional selfie
   * @param ipAddress Client IP address for audit logging
   * @param userAgent Client user agent for audit logging
   */
  static async activateAccount(
    token: string,
    data: ActivationWithSelfiePayload | BackOfficeActivationPayload,
    roleName: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ id: string; email: string; fullName: string; status: string }> {
    // 1. Find user by token (role already known from prior validateActivationToken call)
    //    OPS-2: hash the incoming plaintext before lookup (column holds sha256).
    const user = await db.query.users.findFirst({
      where: eq(users.invitationToken, hashInvitationToken(token)),
    });

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'The invitation token is invalid or has already been used.', 401);
    }

    if (user.status !== 'invited') {
        throw new AppError('AUTH_ALREADY_ACTIVATED', 'This account has already been activated.', 400);
    }

    // Check expiry (24 hours)
    if (user.invitedAt) {
      const expiryDate = new Date(user.invitedAt);
      expiryDate.setHours(expiryDate.getHours() + 24);
      if (new Date() > expiryDate) {
        throw new AppError('AUTH_TOKEN_EXPIRED', 'Invitation token has expired.', 401);
      }
    }

    // Determine if this is a back-office activation (password only)
    const backOffice = isBackOfficeRole(roleName);

    // 2. Hash password
    const passwordHash = await hashPassword(data.password);

    // 3. Process selfie if provided (field roles only)
    let selfieData: { originalUrl: string; idCardUrl: string; livenessScore: number } | null = null;
    if (!backOffice && 'selfieBase64' in data && data.selfieBase64) {
      try {
        const imageBuffer = this.decodeBase64Image(data.selfieBase64);
        const photoService = new PhotoProcessingService();
        selfieData = await photoService.processLiveSelfie(imageBuffer);

        logger.info({
          event: 'activation.selfie_processed',
          userId: user.id,
          livenessScore: selfieData.livenessScore,
        });
      } catch (err: unknown) {
        logger.warn({
          event: 'activation.selfie_failed',
          userId: user.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        if (err instanceof AppError && err.code === 'VALIDATION_ERROR') {
          throw err;
        }
        selfieData = null;
      }
    }

    let updatedUser;
    try {
      // 4. Update user and log audit in a transaction
      updatedUser = await db.transaction(async (tx) => {
        // Build update object — back-office gets password only, field roles get full profile
        const updateData: Record<string, unknown> = {
          passwordHash,
          status: 'active',
          invitationToken: null, // Invalidate token
          updatedAt: new Date(),
        };

        if (!backOffice) {
          // Field role: include all profile fields
          const fullData = data as ActivationWithSelfiePayload;

          // Double check NIN uniqueness within transaction
          const existingNin = await tx.query.users.findFirst({
              where: and(eq(users.nin, fullData.nin))
          });

          if (existingNin && existingNin.id !== user.id) {
              throw new AppError('PROFILE_NIN_DUPLICATE', 'This NIN is already registered to another account.', 409);
          }

          updateData.nin = fullData.nin;
          updateData.dateOfBirth = fullData.dateOfBirth;
          updateData.homeAddress = fullData.homeAddress;
          updateData.bankName = fullData.bankName;
          updateData.accountNumber = fullData.accountNumber;
          updateData.accountName = fullData.accountName;
          updateData.nextOfKinName = fullData.nextOfKinName;
          updateData.nextOfKinPhone = fullData.nextOfKinPhone;

          // Add selfie data if processed successfully
          if (selfieData) {
            updateData.liveSelfieOriginalUrl = selfieData.originalUrl;
            updateData.liveSelfieIdCardUrl = selfieData.idCardUrl;
            updateData.livenessScore = selfieData.livenessScore.toString();
          }
        }

        const [result] = await tx.update(users)
          .set(updateData)
          .where(eq(users.id, user.id))
          .returning();

        await AuditService.logActionTx(tx, {
          actorId: user.id,
          action: 'user.activated',
          targetResource: 'users',
          targetId: user.id,
          details: {
            activatedAt: new Date().toISOString(),
            selfieUploaded: !!selfieData,
            backOfficeActivation: backOffice,
          },
          ipAddress: ipAddress || 'unknown',
          userAgent: userAgent || 'unknown',
        });

        return result;
      });
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;

      // Handle unique constraint violations
      const dbError = err as { code?: string; constraint_name?: string };
      if (dbError.code === '23505') {
        if (dbError.constraint_name === 'users_nin_unique') {
            throw new AppError('PROFILE_NIN_DUPLICATE', 'This NIN is already registered.', 409);
        }
        if (dbError.constraint_name === 'users_email_unique') {
            throw new AppError('EMAIL_EXISTS', 'Email already exists.', 409);
        }
        throw new AppError('CONFLICT', 'A conflict occurred with existing data.', 409);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    logger.info({
      event: 'activation.complete',
      userId: user.id,
      role: roleName,
      backOfficeActivation: backOffice,
    });

    return updatedUser;
  }

  /**
   * Staff login - validates credentials and creates session
   */
  static async loginStaff(
    email: string,
    password: string,
    rememberMe = false,
    ipAddress?: string,
    userAgent?: string
  ): Promise<StaffLoginResult> {
    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
      with: {
        role: true,
      },
    });

    // Generic error to prevent email enumeration
    const genericError = new AppError(
      'AUTH_INVALID_CREDENTIALS',
      'Invalid email or password',
      401
    );

    if (!user) {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'user_not_found',
        email: normalizedEmail,
        ipAddress,
      });
      throw genericError;
    }

    // Check if account is locked
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'account_locked',
        userId: user.id,
        lockedUntil: user.lockedUntil,
        ipAddress,
      });
      throw new AppError(
        'AUTH_ACCOUNT_LOCKED',
        'Account is temporarily locked due to too many failed login attempts. Please try again later.',
        429
      );
    }

    // Check account status
    if (user.status === 'invited') {
      throw new AppError(
        'AUTH_ACCOUNT_NOT_ACTIVATED',
        'Please complete your account activation first',
        403
      );
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'account_suspended',
        userId: user.id,
        status: user.status,
        ipAddress,
      });
      throw new AppError(
        'AUTH_ACCOUNT_SUSPENDED',
        'Your account has been suspended. Please contact support.',
        403
      );
    }

    // Validate password
    if (!user.passwordHash) {
      throw genericError;
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);

    if (!isValidPassword) {
      // Increment failed login attempts
      const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      let lockUntil = null;

      // Lock account after threshold
      if (newFailedAttempts >= EXTENDED_LOCKOUT_THRESHOLD) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      } else if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        // Warning - close to lockout
        logger.warn({
          event: 'auth.login_failed',
          reason: 'approaching_lockout',
          userId: user.id,
          failedAttempts: newFailedAttempts,
          ipAddress,
        });
      }

      await db.update(users)
        .set({
          failedLoginAttempts: newFailedAttempts,
          lockedUntil: lockUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      logger.warn({
        event: 'auth.login_failed',
        reason: 'invalid_password',
        userId: user.id,
        failedAttempts: newFailedAttempts,
        ipAddress,
      });

      throw genericError;
    }

    // Verify this is a staff user (not public)
    const staffRoles = [
      UserRole.SUPER_ADMIN,
      UserRole.SUPERVISOR,
      UserRole.ENUMERATOR,
      UserRole.DATA_ENTRY_CLERK,
      UserRole.VERIFICATION_ASSESSOR,
      UserRole.GOVERNMENT_OFFICIAL,
    ];

    if (!staffRoles.includes(user.role.name as UserRole)) {
      throw new AppError(
        'AUTH_INVALID_CREDENTIALS',
        'Please use the public login for non-staff accounts',
        401
      );
    }

    // Story 9-13 — MFA branch: when enrolled, defer JWT issuance to step-2.
    // Reset failed-login counter here too; password was correct, only MFA remains.
    if (user.mfaEnabled) {
      await db.update(users)
        .set({
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      const mfaChallengeToken = await MfaService.mintChallengeToken({
        userId: user.id,
        email: user.email,
        rememberMe,
        passwordProven: true, // 13-18 M1 — step-1 was a password proof
      });

      logger.info({
        event: 'auth.login_mfa_required',
        userId: user.id,
        rememberMe,
        ipAddress,
      });

      return {
        requiresMfa: true,
        mfaChallengeToken,
        expiresIn: MFA_CHALLENGE_TTL_SECONDS,
      };
    }

    // Success - create session and tokens
    const session = await this.createLoginSession(user, rememberMe, ipAddress, userAgent);
    await grantLoginReAuthGrace(user.id); // 13-18 AC4 — password proven interactively
    return session;
  }

  /**
   * Story 9-13 — complete a staff login after a successful TOTP verify on
   * the login step-2 endpoint. Re-validates the user (status / lockout could
   * have flipped between step-1 and step-2) and creates the session.
   */
  static async completeStaffLoginAfterMfa(
    userId: string,
    rememberMe: boolean,
    ipAddress?: string,
    userAgent?: string,
    // 13-18 review M1 — grace is granted only when the challenge token says
    // step-1 was a PASSWORD proof. Defaults to false so a caller that forgets
    // to thread it through fails safe (no grace), never the other way.
    passwordProven = false,
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { role: true },
    });
    if (!user) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    if (user.status === 'suspended' || user.status === 'deactivated') {
      throw new AppError(
        'AUTH_ACCOUNT_SUSPENDED',
        'Your account has been suspended. Please contact support.',
        403,
      );
    }
    const session = await this.createLoginSession(user, rememberMe, ipAddress, userAgent);
    if (passwordProven) {
      // 13-18 AC4 — password proven at MFA step-1 (staff login). A magic-link
      // step-1 (possession proof) deliberately grants NO grace (review M1).
      await grantLoginReAuthGrace(user.id);
    }
    return session;
  }

  /**
   * Public user login - validates credentials and creates session
   */
  static async loginPublic(
    email: string,
    password: string,
    rememberMe = false,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
      with: {
        role: true,
      },
    });

    const genericError = new AppError(
      'AUTH_INVALID_CREDENTIALS',
      'Invalid email or password',
      401
    );

    if (!user) {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'user_not_found',
        email: normalizedEmail,
        ipAddress,
        loginType: 'public',
      });
      throw genericError;
    }

    // Same validation as staff (locked, suspended, password)
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      throw new AppError(
        'AUTH_ACCOUNT_LOCKED',
        'Account is temporarily locked. Please try again later.',
        429
      );
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      throw new AppError(
        'AUTH_ACCOUNT_SUSPENDED',
        'Your account has been suspended.',
        403
      );
    }

    // Check if user registered via Google OAuth BEFORE password validation (Story 3.0)
    // Google users have null passwordHash, so this must come first to return the correct error
    if (user.authProvider === 'google') {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'google_only_account',
        userId: user.id,
        ipAddress,
        loginType: 'public',
      });
      throw new AppError(
        'AUTH_GOOGLE_ONLY',
        "This account uses Google Sign-In. Please use 'Continue with Google' to access your account.",
        400
      );
    }

    if (!user.passwordHash) {
      throw genericError;
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);

    if (!isValidPassword) {
      const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
      let lockUntil = null;

      if (newFailedAttempts >= EXTENDED_LOCKOUT_THRESHOLD) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }

      await db.update(users)
        .set({
          failedLoginAttempts: newFailedAttempts,
          lockedUntil: lockUntil,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      logger.warn({
        event: 'auth.login_failed',
        reason: 'invalid_password',
        userId: user.id,
        ipAddress,
        loginType: 'public',
      });

      throw genericError;
    }

    // Verify this is a public user
    if (user.role.name !== UserRole.PUBLIC_USER) {
      throw new AppError(
        'AUTH_INVALID_CREDENTIALS',
        'Please use the staff login for staff accounts',
        401
      );
    }

    const session = await this.createLoginSession(user, rememberMe, ipAddress, userAgent);
    await grantLoginReAuthGrace(user.id); // 13-18 AC4 — password proven interactively
    return session;
  }

  /**
   * Story 9-16 — Public-user sign-in via a one-time magic-link token.
   *
   * A NEW passwordless auth channel layered on the Story 9-12 magic-link
   * primitive — NOT a replacement for `loginPublic` (email + password still
   * works for all existing public_users). Forward-compatible with future
   * passwordless wizard accounts: deliberately does NOT gate on a non-null
   * `passwordHash` (unlike `loginPublic`, which bcrypt-compares).
   *
   * Order of operations matters:
   *   1. Consume the `login`-purpose token FIRST (atomic single-use; throws
   *      MAGIC_LINK_* 400 on invalid/expired/already-used).
   *   2. Look up the user by the token's canonical (lowercased) email.
   *   3. Account-state gates in the SAME shape + error codes as `loginPublic`.
   *   4. MFA-aware — Story 9-13's 2-step challenge is honoured; magic-link
   *      login MUST NOT bypass MFA.
   */
  static async loginByMagicLinkToken(args: {
    plaintext: string;
    rememberMe?: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<MagicLinkLoginResult> {
    const { plaintext, rememberMe = false, ipAddress, userAgent } = args;

    // 1. Atomic single-use consume. Throws MAGIC_LINK_INVALID / _EXPIRED /
    //    _ALREADY_USED (all 400) before any user lookup.
    const consumed = await MagicLinkService.consumeToken({ plaintext, purpose: 'login' });

    // Generic error to prevent email enumeration (parity with loginPublic).
    const genericError = new AppError(
      'AUTH_INVALID_CREDENTIALS',
      'Invalid email or password',
      401
    );

    // 2. Look up by the canonical email (already lowercased+trimmed at issue time).
    const user = await db.query.users.findFirst({
      where: eq(users.email, consumed.email),
      with: {
        role: true,
      },
    });

    // 3a. User not found → generic 401 (anti-enumeration).
    if (!user) {
      logger.warn({
        event: 'auth.login_failed',
        reason: 'user_not_found',
        email: consumed.email,
        ipAddress,
        loginType: 'public',
        trigger: 'magic_link',
      });
      throw genericError;
    }

    // 3b. Locked account → 429 (reuse existing code + constant).
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      throw new AppError(
        'AUTH_ACCOUNT_LOCKED',
        'Account is temporarily locked. Please try again later.',
        429
      );
    }

    // 3c. Suspended / deactivated → 403.
    if (user.status === 'suspended' || user.status === 'deactivated') {
      throw new AppError(
        'AUTH_ACCOUNT_SUSPENDED',
        'Your account has been suspended.',
        403
      );
    }

    // 3d. Magic-link login is PUBLIC-ONLY. Staff accounts must use the staff
    //     login (MFA + password). The frontend only surfaces the magic-link
    //     entry-point on `type='public'`, so this is defence-in-depth.
    if (user.role.name !== UserRole.PUBLIC_USER) {
      throw new AppError(
        'AUTH_INVALID_CREDENTIALS',
        'Please use the staff login for staff accounts',
        401
      );
    }

    // 4. MFA branch — honour Story 9-13's 2-step challenge BEFORE issuing a
    //    session. Bypassing this would silently defeat the MFA security uplift.
    if (user.mfaEnabled) {
      const mfaChallengeToken = await MfaService.mintChallengeToken({
        userId: user.id,
        email: user.email,
        rememberMe,
        // 13-18 M1 — magic-link possession is NOT a password proof; step-2
        // completion must not grant the re-auth grace for this login.
        passwordProven: false,
      });

      logger.info({
        event: 'auth.login_mfa_required',
        userId: user.id,
        rememberMe,
        ipAddress,
        trigger: 'magic_link',
      });

      return {
        requiresMfa: true,
        mfaChallengeToken,
        expiresIn: MFA_CHALLENGE_TTL_SECONDS,
      };
    }

    // 5. Success — create session + tokens. The 'magic_link' trigger is folded
    //    into the single login-success audit entry (see createLoginSession).
    return this.createLoginSession(user, rememberMe, ipAddress, userAgent, 'magic_link');
  }

  /**
   * Story 9-38 — provision a PASSWORDLESS `public_user` account from a public
   * wizard submission.
   *
   * THE GAP THIS CLOSES: post-9-12 the wizard creates a `respondents` row only
   * (never a `users` row), so magic-link login (9-16) AND password login were
   * unreachable for every new wizard registrant. This mints the account so the
   * channel becomes reachable, and returns its id so the caller can stamp
   * `respondents.user_id`.
   *
   * Design (locked, see story Dev Notes):
   *   - Email-presence-driven — NOT gated on an auth-method choice (9-18 retires
   *     that). Passwordless by default (`passwordHash = NULL`, `authProvider =
   *     'email'`); users add a password later via Story 9-32.
   *   - `status = 'active'` — the respondent supplied the email themselves and
   *     the first magic-link click re-proves ownership; we do NOT create as
   *     `pending_verification` (that status gates flows this channel doesn't
   *     use). NDPA-reviewed (Task 1, Iris).
   *   - Idempotent + no-clobber: `users.email` is UNIQUE; on conflict we LINK to
   *     the existing row and make NO destructive change (never overwrite
   *     passwordHash / status / fullName / role). TOCTOU-safe via
   *     `onConflictDoNothing` + re-read (no read-then-write race window).
   *
   * Audit: emits a single `data.create` entry on actual creation only (not on
   * the link-to-existing path — nothing was created). Fire-and-forget so an
   * audit hiccup never propagates into the non-fatal wizard-submit caller.
   *
   * @returns `{ userId, created }` — `created=false` means an account already
   *   existed for this email and was linked, not created.
   */
  static async provisionPublicUserForWizard(args: {
    email: string;
    fullName: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ userId: string; created: boolean }> {
    const normalizedEmail = args.email.toLowerCase().trim();
    const fullName = args.fullName.trim() || 'Registrant';

    // Resolve the public_user role id. A missing base-role row is a deploy
    // misconfiguration (DB not seeded) — surface it loudly; the wizard caller
    // wraps this non-fatally so it still won't sink the survey submission.
    const publicRole = await db.query.roles.findFirst({
      where: eq(roles.name, UserRole.PUBLIC_USER),
      columns: { id: true },
    });
    if (!publicRole) {
      throw new AppError(
        'PUBLIC_ROLE_NOT_FOUND',
        "Base role 'public_user' is missing — database not seeded.",
        500,
      );
    }

    // Insert passwordless; on email conflict do nothing (idempotent, no-clobber).
    const inserted = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash: null, // passwordless — magic-link only (9-16 forward-compat)
        fullName,
        roleId: publicRole.id,
        status: 'active',
        authProvider: 'email',
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });

    if (inserted.length > 0) {
      const userId = inserted[0].id;
      logger.info({
        event: 'wizard.account_provisioned',
        userId,
        email: normalizedEmail,
      });
      // Fire-and-forget audit (DATA_CREATE / account). No new audit-action key.
      // `logAction` is synchronous-return (dispatches the write internally), so
      // it is called without await/catch — matching every other call site.
      AuditService.logAction({
        actorId: null,
        action: AUDIT_ACTIONS.DATA_CREATE,
        targetResource: 'users',
        targetId: userId,
        details: {
          trigger: 'public_wizard_account_provision',
          email: normalizedEmail,
          role: UserRole.PUBLIC_USER,
          passwordless: true,
        },
        ipAddress: args.ipAddress || 'unknown',
        userAgent: args.userAgent || 'unknown',
      });
      return { userId, created: true };
    }

    // Conflict → an account already exists for this email. Link to it; no clobber.
    const existing = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
      columns: { id: true },
    });
    if (!existing) {
      // Extremely unlikely (conflict fired but row not found) — surface clearly.
      throw new AppError(
        'PUBLIC_USER_PROVISION_RACE',
        'Account provisioning hit an unresolved email conflict.',
        500,
      );
    }
    logger.info({
      event: 'wizard.account_provision_linked_existing',
      userId: existing.id,
      email: normalizedEmail,
    });
    return { userId: existing.id, created: false };
  }

  /**
   * Creates login session and tokens (shared between staff and public login)
   */
  private static async createLoginSession(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: any,
    rememberMe: boolean,
    ipAddress?: string,
    userAgent?: string,
    // Story 9-16 — auth channel marker folded into the audit entry so the
    // Story 9-11 viewer can filter password vs magic-link logins.
    trigger: LoginTrigger = 'password'
  ): Promise<LoginResponse & { refreshToken: string; sessionId: string }> {
    // Create session (invalidates previous sessions - single session enforcement)
    const sessionInfo = await SessionService.createSession(user.id, rememberMe);

    // Create auth user object
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name as UserRole,
      lgaId: user.lgaId || undefined,
      status: user.status,
    };

    // Generate access token
    const { token: accessToken, jti, expiresIn } = TokenService.generateAccessToken(
      authUser,
      rememberMe
    );

    // Generate refresh token
    const refreshToken = await TokenService.generateRefreshToken(
      user.id,
      sessionInfo.sessionId,
      rememberMe
    );

    // Link token to session
    await SessionService.linkTokenToSession(sessionInfo.sessionId, jti);

    // Reset failed login attempts and update last login
    await db.update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        currentSessionId: sessionInfo.sessionId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Log successful login
    logger.info({
      event: 'auth.login_success',
      userId: user.id,
      role: user.role.name,
      rememberMe,
      ipAddress,
    });

    // Audit log (fire-and-forget — login succeeds even if audit fails).
    // Story 9-16 — `trigger` distinguishes password vs magic-link logins for
    // the Story 9-11 audit-log viewer (single entry per login, no duplication).
    AuditService.logAction({
      actorId: user.id,
      action: 'auth.login_success',
      targetResource: 'users',
      targetId: user.id,
      details: {
        rememberMe,
        sessionId: sessionInfo.sessionId,
        trigger,
      },
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
    });

    return {
      accessToken,
      user: authUser,
      expiresIn,
      refreshToken,
      sessionId: sessionInfo.sessionId,
    };
  }

  /**
   * Logout - invalidates session and blacklists token
   */
  static async logout(
    userId: string,
    jti: string,
    sessionId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    // Blacklist the access token
    await TokenService.addToBlacklist(jti);

    // F-012 (Story 9-42): positively invalidate the refresh token rather than
    // relying on the indirect session-key check at /refresh. The access token is
    // already blacklisted above; this kills the refresh token too.
    await TokenService.invalidateUserRefreshTokens(userId);

    // Invalidate the session
    await SessionService.invalidateSession(sessionId, 'logout');

    // 13-18 — the re-auth grace must not outlive the session that earned it.
    // Non-fatal: logout must succeed even if the Redis DEL blips.
    try {
      await clearReAuth(userId);
    } catch (error) {
      logger.warn({
        event: 'auth.logout_reauth_clear_failed',
        userId,
        error: (error as Error).message,
      });
    }

    // Clear session ID from user record
    await db.update(users)
      .set({
        currentSessionId: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Log logout
    logger.info({
      event: 'auth.logout',
      userId,
      sessionId,
      ipAddress,
    });

    // Audit log (fire-and-forget — logout succeeds even if audit fails)
    AuditService.logAction({
      actorId: userId,
      action: 'auth.logout',
      targetResource: 'users',
      targetId: userId,
      details: { sessionId },
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
    });
  }

  /**
   * Refresh token - generates new access token using refresh token
   */
  static async refreshToken(
    refreshToken: string,
    ipAddress?: string
  ): Promise<{ accessToken: string; expiresIn: number; refreshToken: string; rememberMe: boolean }> {
    // Validate refresh token
    const tokenData = await TokenService.validateRefreshToken(refreshToken);

    if (!tokenData) {
      // F-022 (Story 9-42): reuse detection. A token that is no longer active
      // might simply be expired — OR it might be a replay of a token we already
      // rotated (consumed). If it matches a consumed-token tombstone, the entire
      // token family is revoked (defends against a stolen-then-replayed token).
      const consumed = await TokenService.getConsumedRefreshToken(refreshToken);
      if (consumed) {
        // M1 (Story 9-48): grace window. A consumed token presented again within
        // REFRESH_ROTATION_GRACE_SECONDS of its rotation is benign multi-tab
        // concurrency (one shared httpOnly cookie, per-tab proactive refresh
        // timers), NOT a replay — RE-ISSUE a fresh session instead of revoking the
        // family. Outside the window it is a genuine reuse → revoke + 401. Within
        // the window an attacker replaying a stolen-then-just-rotated token is also
        // re-authenticated (the deliberate, bounded relaxation Auth0's refresh
        // leeway makes); the small window caps that exposure.
        if (TokenService.isWithinRotationGrace(consumed.rotatedAt)) {
          const reissued = await this.completeRefresh(
            consumed.userId,
            consumed.sessionId,
            consumed.rememberMe,
            refreshToken,
            ipAddress,
            'reissue',
          );
          logger.info({
            event: 'auth.refresh_grace_reissue',
            userId: consumed.userId,
            sessionId: consumed.sessionId,
            ipAddress,
          });
          return reissued;
        }

        await TokenService.revokeAllUserTokens(consumed.userId);
        await TokenService.clearConsumedRefreshToken(refreshToken);
        logger.warn({
          event: 'auth.refresh_reuse_detected',
          userId: consumed.userId,
          ipAddress,
        });
        throw new AppError('AUTH_TOKEN_REUSE_DETECTED', 'Please log in again', 401);
      }
      throw new AppError('AUTH_INVALID_TOKEN', 'Invalid or expired refresh token', 401);
    }

    // Defense-in-depth: reject refresh tokens created before a revocation event (role change, password reset)
    const refreshIssuedAt = Math.floor(new Date(tokenData.createdAt).getTime() / 1000);
    const isRevoked = await TokenService.isTokenRevokedByTimestamp(tokenData.userId, refreshIssuedAt);
    if (isRevoked) {
      await TokenService.invalidateRefreshToken(refreshToken);
      throw new AppError('AUTH_TOKEN_REVOKED', 'Please log in again', 401);
    }

    const result = await this.completeRefresh(
      tokenData.userId,
      tokenData.sessionId,
      tokenData.rememberMe,
      refreshToken,
      ipAddress,
      'rotate',
    );

    logger.info({
      event: 'auth.token_refreshed',
      userId: tokenData.userId,
      sessionId: tokenData.sessionId,
      ipAddress,
    });

    return result;
  }

  /**
   * Shared tail of /refresh: re-validate the session + user, then issue a fresh
   * access token and refresh token. Used by both the normal rotation path
   * (`mode: 'rotate'` — tombstones + retires the presented token) and the M1
   * grace re-issue path (`mode: 'reissue'` — the presented token is already
   * consumed, so a brand-new refresh token is minted instead of rotating). The
   * same session/user-status guards run in both modes so an in-grace re-issue
   * cannot revive a suspended account or an invalidated session (AC#6 — no control
   * weakened).
   */
  private static async completeRefresh(
    userId: string,
    sessionId: string,
    rememberMe: boolean,
    presentedToken: string,
    ipAddress: string | undefined,
    mode: 'rotate' | 'reissue',
  ): Promise<{ accessToken: string; expiresIn: number; refreshToken: string; rememberMe: boolean }> {
    // Validate session
    const sessionValidation = await SessionService.validateSession(sessionId);

    if (!sessionValidation.valid) {
      // Invalidate the presented refresh token if it is still active (rotate mode).
      // In reissue mode it is already consumed/retired, so there is nothing to kill.
      if (mode === 'rotate') {
        await TokenService.invalidateRefreshToken(presentedToken);
      }

      const reason = sessionValidation.reason;
      if (reason === 'inactivity') {
        throw new AppError('AUTH_SESSION_EXPIRED', 'Session expired due to inactivity', 401);
      }
      if (reason === 'absolute_timeout') {
        throw new AppError('AUTH_SESSION_EXPIRED', 'Session has expired. Please log in again.', 401);
      }
      throw new AppError('AUTH_SESSION_EXPIRED', 'Session is no longer valid', 401);
    }

    // Get user data for new token
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        role: true,
      },
    });

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'User not found', 401);
    }

    // Check user status
    if (user.status === 'suspended' || user.status === 'deactivated') {
      if (mode === 'rotate') {
        await TokenService.invalidateRefreshToken(presentedToken);
      }
      throw new AppError('AUTH_ACCOUNT_SUSPENDED', 'Your account has been suspended', 403);
    }

    // Create auth user object
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name as UserRole,
      lgaId: user.lgaId || undefined,
      status: user.status,
    };

    // Generate new access token
    const { token: accessToken, jti, expiresIn } = TokenService.generateAccessToken(
      authUser,
      rememberMe
    );

    // Issue the new refresh token. 'rotate' (F-022, Story 9-42): the presented
    // token is tombstoned + retired and a fresh refresh token is minted; a later
    // replay trips the reuse-detection branch. 'reissue' (M1, Story 9-48): the
    // presented token was ALREADY consumed by the racing tab, so we mint a fresh
    // token directly (the controller sets it as the new httpOnly cookie).
    const newRefreshToken = mode === 'rotate'
      ? await TokenService.rotateRefreshToken(presentedToken, userId, sessionId, rememberMe)
      : await TokenService.generateRefreshToken(userId, sessionId, rememberMe);

    // Update session with new token JTI
    await SessionService.linkTokenToSession(sessionId, jti);

    // Update last activity
    await SessionService.updateLastActivity(sessionId);

    return { accessToken, expiresIn, refreshToken: newRefreshToken, rememberMe };
  }

  /**
   * Re-authenticate for sensitive actions (Remember Me sessions)
   */
  static async reAuthenticate(
    userId: string,
    password: string,
    ipAddress?: string
  ): Promise<{ verified: boolean; expiresIn: number }> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || !user.passwordHash) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid credentials', 401);
    }

    const isValid = await comparePassword(password, user.passwordHash);

    if (!isValid) {
      logger.warn({
        event: 'auth.reauth_failed',
        userId,
        ipAddress,
      });
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid password', 401);
    }

    logger.info({
      event: 'auth.reauth_success',
      userId,
      ipAddress,
    });

    // Re-auth is valid for 5 minutes
    const REAUTH_EXPIRY = 5 * 60;

    return {
      verified: true,
      expiresIn: REAUTH_EXPIRY,
    };
  }

  /**
   * Decodes a base64 image string to a Buffer
   * Handles both data URL format (data:image/jpeg;base64,...) and raw base64
   */
  private static decodeBase64Image(base64String: string): Buffer {
    // Remove data URL prefix if present
    let base64Data = base64String;
    const dataUrlMatch = base64String.match(/^data:image\/\w+;base64,(.+)$/);
    if (dataUrlMatch) {
      base64Data = dataUrlMatch[1];
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Basic validation - ensure we got actual data
    if (buffer.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Invalid base64 image data', 400);
    }

    return buffer;
  }
}
