import { parse } from 'csv-parse/sync';
import { Redis } from 'ioredis';
import pino from 'pino';
import { staffImportRowSchema, createStaffSchema, type StaffImportRow, type CreateStaffDto, type EmailStatus } from '@oslsr/types';
import { AppError, generateInvitationToken } from '@oslsr/utils';
import { db } from '../db/index.js';
import { users, auditLogs, roles, lgas } from '../db/schema/index.js';
import { eq, ilike, or, count, and, SQL } from 'drizzle-orm';
import { queueStaffInvitationEmail } from '../queues/email.queue.js';
import { EmailService } from './email.service.js';
import { TokenService } from './token.service.js';
import { SessionService } from './session.service.js';
import { PhotoProcessingService } from './photo-processing.service.js';
import { IDCardService } from './id-card.service.js';

const photoService = new PhotoProcessingService();
const idCardService = new IDCardService();

const logger = pino({ name: 'staff-service' });

// Redis key for resend rate limiting
const RESEND_LIMIT_KEY = (userId: string) => `resend:limit:${userId}`;
const RESEND_LIMIT_TTL = 24 * 60 * 60; // 24 hours
const MAX_RESENDS_PER_DAY = 3;

/**
 * Staff list query parameters
 */
export interface ListUsersParams {
  page?: number;
  limit?: number;
  status?: string;
  roleId?: string;
  lgaId?: string;
  search?: string;
}

/**
 * Staff list response with user data and metadata
 */
export interface StaffListResponse {
  data: Array<{
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    status: string;
    roleId: string;
    roleName: string;
    lgaId: string | null;
    lgaName: string | null;
    createdAt: Date;
    invitedAt: Date | null;
  }>;
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class StaffService {
  /**
   * List staff members with pagination, filtering, and search
   * Story 2.5-3, AC1
   *
   * @param params Query parameters for filtering and pagination
   * @returns Paginated list of staff members with role and LGA names
   */
  static async listUsers(params: ListUsersParams): Promise<StaffListResponse> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100); // Max 100 per page
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: SQL[] = [];

    if (params.status) {
      conditions.push(eq(users.status, params.status as typeof users.status.enumValues[number]));
    }

    if (params.roleId) {
      conditions.push(eq(users.roleId, params.roleId));
    }

    if (params.lgaId) {
      conditions.push(eq(users.lgaId, params.lgaId));
    }

    if (params.search) {
      // Case-insensitive partial match on name or email
      conditions.push(
        or(
          ilike(users.fullName, `%${params.search}%`),
          ilike(users.email, `%${params.search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Execute queries in parallel for performance
    const [staffList, countResult] = await Promise.all([
      db.query.users.findMany({
        where: whereClause,
        with: {
          role: true,
          lga: true,
        },
        orderBy: (users, { desc }) => [desc(users.createdAt)],
        limit,
        offset,
      }),
      db.select({ count: count() }).from(users).where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: staffList.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        status: user.status,
        roleId: user.roleId,
        roleName: user.role?.name || 'Unknown',
        lgaId: user.lgaId,
        lgaName: user.lga?.name || null,
        createdAt: user.createdAt,
        invitedAt: user.invitedAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update a user's role
   * Story 2.5-3, AC5, AC6
   *
   * @param userId The user ID to update
   * @param newRoleId The new role ID
   * @param actorId The admin performing the action
   * @returns The updated user
   */
  static async updateRole(
    userId: string,
    newRoleId: string,
    actorId: string
  ): Promise<typeof users.$inferSelect> {
    // Fetch user
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Fetch role to validate it exists
    const role = await db.query.roles.findFirst({
      where: eq(roles.id, newRoleId),
    });

    if (!role) {
      throw new AppError('ROLE_NOT_FOUND', 'Role not found', 404);
    }

    // If role is unchanged, return user without modifications
    if (user.roleId === newRoleId) {
      logger.info({
        event: 'staff.role_unchanged',
        userId,
        roleId: newRoleId,
        actorId,
      });
      return user;
    }

    const previousRoleId = user.roleId;

    // Update role and create audit log in transaction
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ roleId: newRoleId, updatedAt: new Date() })
        .where(eq(users.id, userId));

      await tx.insert(auditLogs).values({
        actorId,
        action: 'user.role_change',
        targetResource: 'users',
        targetId: userId,
        details: {
          previousRoleId,
          newRoleId,
          newRoleName: role.name,
          sessionInvalidated: true,
        },
      });
    });

    // AC6: Invalidate all sessions (force re-login with new permissions)
    await TokenService.invalidateAllUserTokens(userId);
    await SessionService.invalidateAllUserSessions(userId);

    logger.info({
      event: 'staff.role_changed',
      userId,
      previousRoleId,
      newRoleId,
      newRoleName: role.name,
      actorId,
      sessionInvalidated: true,
    });

    // Return updated user
    const updatedUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    return updatedUser!;
  }

  /**
   * Deactivate a user account
   * Story 2.5-3, AC4, AC6
   *
   * @param userId The user ID to deactivate
   * @param actorId The admin performing the action
   * @returns The deactivated user
   */
  static async deactivateUser(
    userId: string,
    actorId: string
  ): Promise<typeof users.$inferSelect> {
    // Fetch user
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Check if already deactivated
    if (user.status === 'deactivated') {
      throw new AppError('ALREADY_DEACTIVATED', 'User is already deactivated', 400);
    }

    // Prevent self-deactivation
    if (userId === actorId) {
      throw new AppError('CANNOT_DEACTIVATE_SELF', 'Cannot deactivate your own account', 400);
    }

    const previousStatus = user.status;

    // Update status and create audit log in transaction
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: 'deactivated', updatedAt: new Date() })
        .where(eq(users.id, userId));

      await tx.insert(auditLogs).values({
        actorId,
        action: 'user.deactivate',
        targetResource: 'users',
        targetId: userId,
        details: {
          previousStatus,
          sessionInvalidated: true,
        },
      });
    });

    // AC6: Invalidate all sessions
    await TokenService.invalidateAllUserTokens(userId);
    await SessionService.invalidateAllUserSessions(userId);

    logger.info({
      event: 'staff.deactivated',
      userId,
      previousStatus,
      actorId,
      sessionInvalidated: true,
    });

    // Return updated user
    const deactivatedUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    return deactivatedUser!;
  }

  /**
   * Download ID card for a staff member (Super Admin only)
   * Story 2.5-3, AC7
   *
   * @param userId The user ID to generate ID card for
   * @returns PDF buffer and filename
   */
  static async downloadIdCard(userId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        role: true,
        lga: true,
      },
    });

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Check user has verified selfie
    if (!user.liveSelfieIdCardUrl) {
      throw new AppError('NO_SELFIE', 'User does not have a verified ID photo', 400);
    }

    // Check user is active or verified (not invited, suspended, or deactivated)
    if (user.status !== 'active' && user.status !== 'verified') {
      throw new AppError(
        'INVALID_STATUS_FOR_ID_CARD',
        `Cannot generate ID card for user with status '${user.status}'`,
        400
      );
    }

    // Fetch photo buffer
    const photoBuffer = await photoService.getPhotoBuffer(user.liveSelfieIdCardUrl);

    // Generate PDF
    const pdfBuffer = await idCardService.generateIDCard({
      fullName: user.fullName,
      role: user.role?.name || 'Staff',
      lga: user.lga?.name || 'Oyo State',
      photoBuffer,
      verificationUrl: `${process.env.PUBLIC_APP_URL || 'https://oslrs.oyostate.gov.ng'}/verify-staff/${user.id}`,
    });

    logger.info({
      event: 'staff.id_card_downloaded',
      userId,
      userStatus: user.status,
    });

    return {
      buffer: pdfBuffer,
      fileName: `oslrs-id-${user.id}.pdf`,
    };
  }

  /**
   * Validates and parses CSV content for staff import.
   * @param content Raw CSV string or buffer
   * @returns Array of validated StaffImportRow objects
   * @throws AppError if validation fails
   */
  static async validateCsv(content: string | Buffer): Promise<StaffImportRow[]> {
    let records: unknown[];
    try {
      records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true
      }) as unknown[];
    } catch (err: unknown) {
      throw new AppError('CSV_PARSE_ERROR', `Failed to parse CSV: ${err instanceof Error ? err.message : 'Unknown error'}`, 400);
    }

    if (!records || records.length === 0) {
      throw new AppError('CSV_EMPTY', 'CSV file is empty or contains no records', 400);
    }

    const validatedRows: StaffImportRow[] = [];

    for (const [index, row] of records.entries()) {
      const lineNumber = index + 2; 

      const result = staffImportRowSchema.safeParse(row);
      if (!result.success) {
        const errorMsg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        throw new AppError(
          'CSV_VALIDATION_ERROR', 
          `Row ${lineNumber} error: ${errorMsg}`, 
          400, 
          { row: lineNumber, errors: result.error.errors }
        );
      }
      validatedRows.push(result.data);
    }

    return validatedRows;
  }

  /**
   * Manually creates a new staff member.
   * @param data validated staff data
   * @param actorId ID of the admin performing the action
   * @returns Created user with emailStatus field (AC8: Graceful Degradation)
   */
  static async createManual(
    data: CreateStaffDto,
    actorId: string
  ): Promise<{ user: typeof users.$inferSelect; emailStatus: EmailStatus }> {
    const validation = createStaffSchema.safeParse(data);
    if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid staff data', 400, { errors: validation.error.errors });
    }

    const { fullName, email, phone, roleId, lgaId } = data;

    // Fetch role to verify LGA requirement
    const roleRecord = await db.query.roles.findFirst({
        where: eq(roles.id, roleId)
    });

    if (!roleRecord) {
        throw new AppError('ROLE_NOT_FOUND', 'Role not found', 404);
    }

    // Check LGA locking logic
    const roleName = roleRecord.name.toUpperCase();
    if (['ENUMERATOR', 'SUPERVISOR'].includes(roleName) && !lgaId) {
        throw new AppError('LGA_REQUIRED', `LGA is required for ${roleRecord.name}`, 400);
    }

    // Optionally fetch LGA name for email
    let lgaName: string | undefined;
    if (lgaId) {
      const lgaRecord = await db.query.lgas.findFirst({
        where: eq(lgas.id, lgaId)
      });
      lgaName = lgaRecord?.name;
    }

    const token = generateInvitationToken();

    let newUser: typeof users.$inferSelect;
    let emailStatus: EmailStatus = 'not_configured';

    try {
        newUser = await db.transaction(async (tx) => {
            const [createdUser] = await tx.insert(users).values({
                fullName,
                email,
                phone,
                roleId,
                lgaId: lgaId || null,
                status: 'invited',
                invitationToken: token,
                invitedAt: new Date(),
            }).returning();

            await tx.insert(auditLogs).values({
                actorId: actorId,
                action: 'user.create',
                targetResource: 'users',
                targetId: createdUser.id,
                details: { roleName: roleRecord.name, lgaId },
                ipAddress: 'system', // TODO: Pass from context if available
                userAgent: 'system'
            });

            return createdUser;
        });
    } catch (err: unknown) {
        // Handle unique constraint violations
        const dbError = err as { code?: string; constraint_name?: string };
        if (dbError.code === '23505') { // Postgres unique violation
            if (dbError.constraint_name === 'users_email_unique') {
                throw new AppError('EMAIL_EXISTS', 'Email already exists', 409);
            }
            if (dbError.constraint_name === 'users_phone_unique') {
                throw new AppError('PHONE_EXISTS', 'Phone number already exists', 409);
            }
        }
        throw err instanceof Error ? err : new Error(String(err));
    }

    // AC8: Graceful Degradation - Queue invitation email (failure doesn't block user creation)
    if (!EmailService.isEnabled()) {
      emailStatus = 'not_configured';
      logger.warn({
        event: 'staff.email.disabled',
        userId: newUser.id,
        email: newUser.email,
        message: 'Email service unavailable - invitation not sent',
      });
    } else {
      try {
        const activationUrl = EmailService.generateStaffActivationUrl(token);

        await queueStaffInvitationEmail(
          {
            email: newUser.email,
            fullName: newUser.fullName,
            roleName: roleRecord.name,
            lgaName,
            activationUrl,
            expiresInHours: 24,
          },
          newUser.id
        );

        emailStatus = 'pending';

        logger.info({
          event: 'staff.email.queued',
          userId: newUser.id,
          email: newUser.email,
        });
      } catch (emailErr: unknown) {
        emailStatus = 'failed';
        logger.error({
          event: 'staff.email.queue_failed',
          userId: newUser.id,
          email: newUser.email,
          error: emailErr instanceof Error ? emailErr.message : 'Unknown error',
        });
        // Don't throw - user creation succeeded
      }
    }

    return { user: newUser, emailStatus };
  }

  /**
   * Processes a single import row (lookup IDs, create user)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async processImportRow(row: StaffImportRow, actorId: string): Promise<any> {
      // Lookup Role - DB lookup is acceptable here because:
      // 1. Roles table is tiny (~7 rows), lookup is sub-millisecond
      // 2. Bulk imports are infrequent (weekly/monthly operations)
      // 3. BullMQ processes rows sequentially, not concurrency-bound
      // If bulk import performance becomes an issue, consider prefetching
      // all roles in the worker and passing as a Map to this method.
      const roleRecord = await db.query.roles.findFirst({
          where: eq(roles.name, row.role_name)
      });
      if (!roleRecord) {
          throw new AppError('ROLE_NOT_FOUND', `Role '${row.role_name}' not found`, 404);
      }

      // Lookup LGA if provided
      let lgaId: string | undefined;
      if (row.lga_name) {
          const lgaRecord = await db.query.lgas.findFirst({
              where: eq(lgas.name, row.lga_name)
          });
          if (!lgaRecord) {
               throw new AppError('LGA_NOT_FOUND', `LGA '${row.lga_name}' not found`, 404);
          }
          lgaId = lgaRecord.id;
      }

      return this.createManual({
          fullName: row.full_name,
          email: row.email,
          phone: row.phone,
          roleId: roleRecord.id,
          lgaId: lgaId
      }, actorId);
  }

  /**
   * Resend invitation email to a staff member
   *
   * AC5: Manual Resend Capability
   * - Generates a new invitation token
   * - Invalidates the previous token
   * - Queues a new invitation email
   * - Logs the resend action in audit trail
   * - Enforces rate limit: max 3 resends per user per 24 hours
   */
  static async resendInvitation(
    userId: string,
    actorId: string,
    redis: Redis
  ): Promise<{ success: boolean; message: string }> {
    // Check rate limit
    const resendCount = await redis.incr(RESEND_LIMIT_KEY(userId));
    if (resendCount === 1) {
      await redis.expire(RESEND_LIMIT_KEY(userId), RESEND_LIMIT_TTL);
    }

    if (resendCount > MAX_RESENDS_PER_DAY) {
      const ttl = await redis.ttl(RESEND_LIMIT_KEY(userId));
      throw new AppError(
        'RATE_LIMIT_EXCEEDED',
        `Maximum ${MAX_RESENDS_PER_DAY} resend attempts per 24 hours exceeded`,
        429,
        { retryAfter: ttl }
      );
    }

    // Fetch user with role and LGA info
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: {
        role: true,
        lga: true,
      },
    });

    if (!user) {
      // Decrement the rate limit counter since this wasn't a valid attempt
      await redis.decr(RESEND_LIMIT_KEY(userId));
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    // Verify user is in 'invited' status
    if (user.status !== 'invited') {
      await redis.decr(RESEND_LIMIT_KEY(userId));
      throw new AppError(
        'INVALID_STATUS',
        `Cannot resend invitation to user with status '${user.status}'`,
        400
      );
    }

    // Generate new token and invalidate old one
    const newToken = generateInvitationToken();

    await db.transaction(async (tx) => {
      // Update user with new token
      await tx.update(users)
        .set({
          invitationToken: newToken,
          invitedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Log audit entry
      await tx.insert(auditLogs).values({
        actorId,
        action: 'invitation.resend',
        targetResource: 'users',
        targetId: userId,
        details: {
          email: user.email,
          roleName: user.role?.name,
          resendCount,
        },
      });
    });

    // Queue the invitation email
    const activationUrl = EmailService.generateStaffActivationUrl(newToken);

    await queueStaffInvitationEmail(
      {
        email: user.email,
        fullName: user.fullName,
        roleName: user.role?.name || 'Staff',
        lgaName: user.lga?.name,
        activationUrl,
        expiresInHours: 24,
      },
      userId
    );

    return {
      success: true,
      message: `Invitation resent to ${user.email}. ${MAX_RESENDS_PER_DAY - resendCount} resends remaining today.`,
    };
  }
}