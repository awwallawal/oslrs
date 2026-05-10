import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';
import { respondents } from './respondents.js';

/**
 * Story 9-12 AC#6: magic-link tokens for public-registration auth.
 *
 * Per Architecture Decision 2.5 (magic-link primary): plaintext token is sent
 * in email exactly once, never persisted. `token_hash` stores SHA-256 hex.
 * Lookup at redemption: hash submitted token → query by token_hash + expires_at
 * > now() + used_at IS NULL. Atomic UPDATE on redemption sets used_at (race-safe
 * single-use enforcement via DB constraint).
 *
 * Three purposes:
 *   - wizard_resume        — TTL 72h; resumes a 5-step wizard mid-flow on a new device.
 *   - pending_nin_complete — TTL 72h; lets respondents whose status is
 *                            'pending_nin_capture' come back and add their NIN.
 *   - login                — TTL 15min; primary auth for existing public users.
 *
 * Foreign keys are nullable to support the new-registration case where no user
 * record exists yet — the token is keyed by `email` until redemption issues a
 * JWT and either creates or attaches the user.
 *
 * MUST NOT import from @oslsr/types — drizzle-kit runs compiled JS and that
 * package has no dist/ build (per MEMORY.md key pattern).
 */

// Inline enum constants (NOT imported from @oslsr/types per drizzle-kit constraint).
// Canonical source: this file. Cross-reference if exposed elsewhere.
export const magicLinkPurposes = [
  'wizard_resume',
  'pending_nin_complete',
  'login',
] as const;
export type MagicLinkPurpose = typeof magicLinkPurposes[number];

export const magicLinkTokens = pgTable(
  'magic_link_tokens',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

    /** SHA-256 hex of the plaintext token sent in email. NEVER stores plaintext. */
    tokenHash: text('token_hash').notNull().unique(),

    /** Why this token was issued; gates redemption-time redirect behaviour. */
    purpose: text('purpose', { enum: magicLinkPurposes }).notNull(),

    /** Destination email for the link. Required regardless of user/respondent. */
    email: text('email').notNull(),

    /** Set when the token belongs to a known user (login purpose, or resumed flow). */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),

    /** Set when purpose=pending_nin_complete — links the token to the specific respondent row. */
    respondentId: uuid('respondent_id').references(() => respondents.id, { onDelete: 'cascade' }),

    /** Hard expiry. Redemption MUST check this against NOW() at the time of redeem. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    /**
     * Atomic single-use marker. Set via:
     *   UPDATE magic_link_tokens
     *   SET used_at = NOW()
     *   WHERE id = $1 AND used_at IS NULL
     *   RETURNING ...
     * Race-safe under concurrent redemption attempts.
     */
    usedAt: timestamp('used_at', { withTimezone: true }),

    /** Forensics: who requested this token, from where. Optional but useful for abuse triage. */
    requestedIp: text('requested_ip'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Fast lookup by hash at redemption time.
    idxTokenHash: index('idx_magic_link_tokens_token_hash').on(table.tokenHash),
    // Fast cleanup sweep of expired tokens.
    idxExpiresAt: index('idx_magic_link_tokens_expires_at').on(table.expiresAt),
    // Fast "any unused token for this email + purpose?" — supports rate-limit-aware reuse.
    idxEmailPurpose: index('idx_magic_link_tokens_email_purpose').on(table.email, table.purpose),
  }),
);

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type NewMagicLinkToken = typeof magicLinkTokens.$inferInsert;
