import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import { users } from './users.js';

// Story 9-13: TOTP MFA backup codes.
// Each row stores ONE bcrypt-hashed 10-digit backup code for one user.
// On enrollment, 8 codes are issued; consumed via atomic
//   UPDATE ... SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING ...
//
// MUST NOT import from @oslsr/types — drizzle-kit runs compiled JS and that
// package has no dist/ build (per MEMORY.md key pattern).
export const userBackupCodes = pgTable(
  'user_backup_codes',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('idx_user_backup_codes_user_id').on(table.userId),
    // Partial index for fast unused-code lookups is added in
    // drizzle/0008_add_mfa_columns.sql (Drizzle's partial-index syntax is limited
    // in 0.45.x; SQL is the load-bearing source of truth).
  }),
);
