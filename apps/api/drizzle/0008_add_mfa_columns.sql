-- Story 9-13: Super Admin TOTP MFA Enrollment & Verification
-- Run AFTER db:push (which adds the columns from Drizzle schema).
--
-- The Drizzle schema diff (apps/api/src/db/schema/users.ts +
-- apps/api/src/db/schema/user-backup-codes.ts) handles:
--   - users.mfa_enabled BOOLEAN NOT NULL DEFAULT false
--   - users.mfa_secret TEXT NULL
--   - users.mfa_grace_until TIMESTAMPTZ NULL
--   - users.mfa_locked_until TIMESTAMPTZ NULL
--   - CREATE TABLE user_backup_codes (id, user_id FK, code_hash, used_at, created_at)
--   - CREATE INDEX idx_user_backup_codes_user_id ON user_backup_codes (user_id)
--
-- This script handles items Drizzle's diff cannot express idiomatically:
--   1. Partial index on (user_id, used_at) WHERE used_at IS NULL — used by
--      atomic backup-code redemption SELECT/UPDATE to win the race when two
--      requests submit the same code simultaneously.
--   2. Seed mfa_grace_until = NOW() + 7 days for every active super_admin row,
--      satisfying Story 9-13 AC#5a deploy-time grace migration.

-- 1. Partial index for fast unused-code lookups
CREATE INDEX IF NOT EXISTS idx_user_backup_codes_unused
  ON user_backup_codes (user_id, used_at)
  WHERE used_at IS NULL;

-- 2. Seed 7-day grace period for active super_admin rows (AC#5a)
-- Idempotent: only sets grace_until when currently NULL, so re-running this
-- script after AC#5a originally fired won't reset the deadline for users who
-- have already started enrolling (and won't shorten the deadline for users who
-- still need to enroll).
UPDATE users
   SET mfa_grace_until = NOW() + interval '7 days'
 WHERE role_id IN (SELECT id FROM roles WHERE name = 'super_admin')
   AND status = 'active'
   AND mfa_grace_until IS NULL
   AND mfa_enabled = false;
