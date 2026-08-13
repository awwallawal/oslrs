import { pgTable, uuid, text, timestamp, date, integer, boolean } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { roles } from './roles.js';
import { lgas } from './lgas.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  email: text('email').notNull().unique(),
  phone: text('phone').unique(),
  fullName: text('full_name').notNull(),
  passwordHash: text('password_hash'), // Nullable for invited state
  nin: text('nin').unique(), // Nullable for invited state
  dateOfBirth: date('date_of_birth'),
  homeAddress: text('home_address'),
  bankName: text('bank_name'),
  accountNumber: text('account_number'),
  accountName: text('account_name'),
  nextOfKinName: text('next_of_kin_name'),
  nextOfKinPhone: text('next_of_kin_phone'),
  liveSelfieOriginalUrl: text('live_selfie_original_url'),
  liveSelfieIdCardUrl: text('live_selfie_id_card_url'),
  /*
   * ⚠️ RENAMED FROM `liveness_score` (Story 13-60 AC6.4). It never held a
   * liveness score. It holds `min(stdev(brightness) / 100, 0.99)` — an image
   * SHARPNESS ratio — computed in photo-processing.service.ts. The old code
   * carried a comment saying the value "comes from Rekognition in production";
   * Rekognition is not wired, has never been wired, and nothing gates on this
   * number. A column whose name asserts a property its value does not have is
   * the sixth instance of this class found in two days.
   *
   * If a real liveness check is ever added, it gets its own column and does not
   * have to fight a name already taken by something else.
   *
   * Stored as text to be safe with float precision or JSON.
   */
  photoSharpnessScore: text('photo_sharpness_score'),
  liveSelfieVerifiedAt: timestamp('live_selfie_verified_at', { withTimezone: true }),

  /*
   * Story 13-60 — photo provenance. Canonical value lists live in
   * `@oslsr/types` (PHOTO_STATUS / PHOTO_SOURCE); inlined here because Drizzle
   * schema files must not import from @oslsr/types (no dist/ at push time).
   *
   * `photoStatus` NULL = the photo step never applied (back-office activation,
   * or an account that predates this column). NULL IS NOT A FAILURE.
   */
  photoStatus: text('photo_status', { enum: ['saved', 'skipped', 'failed'] }),
  photoSource: text('photo_source', { enum: ['live_capture', 'upload'] }),
  photoFailureReason: text('photo_failure_reason'),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  lgaId: uuid('lga_id').references(() => lgas.id), // Nullable for state-wide roles
  status: text('status', { enum: ['invited', 'active', 'verified', 'suspended', 'deactivated', 'pending_verification'] }).notNull().default('invited'),
  invitationToken: text('invitation_token').unique(),
  invitedAt: timestamp('invited_at', { withTimezone: true }),

  // OAuth columns (Story 3.0)
  authProvider: text('auth_provider').notNull().default('email'), // 'email' | 'google'
  googleId: text('google_id').unique(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

  // Email verification columns (Story 1.8)
  emailVerificationToken: text('email_verification_token').unique(),
  emailVerificationExpiresAt: timestamp('email_verification_expires_at', { withTimezone: true }),

  // Session management columns (Story 1.7)
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  currentSessionId: uuid('current_session_id'), // For single-session enforcement

  // Password reset columns (Story 1.7)
  passwordResetToken: text('password_reset_token').unique(),
  passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),

  // Login attempt tracking (Story 1.7) - Can use Redis for high-traffic, DB for persistence
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),

  // MFA (Story 9-13). mfaLockedUntil is a SEPARATE concern from lockedUntil above
  // — that one tracks failed-password lockout; this one tracks failed-TOTP lockout.
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaSecret: text('mfa_secret'), // base32; TODO(9-9): encrypt at rest once AES-256 helper from Story 9-9 AC#5 lands
  mfaGraceUntil: timestamp('mfa_grace_until', { withTimezone: true }),
  mfaLockedUntil: timestamp('mfa_locked_until', { withTimezone: true }),

  // Seed data identification (ADR-017)
  isSeeded: boolean('is_seeded').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
