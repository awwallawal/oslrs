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
  livenessScore: text('liveness_score'), // Stored as text to be safe with float precision or JSON
  liveSelfieVerifiedAt: timestamp('live_selfie_verified_at', { withTimezone: true }),
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

  // Seed data identification (ADR-017)
  isSeeded: boolean('is_seeded').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
