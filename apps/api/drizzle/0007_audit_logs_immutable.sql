-- Story 6-1: Immutable Append-Only Audit Logs
-- Adds hash chaining columns and append-only trigger enforcement
-- Run AFTER db:push (which adds the columns from Drizzle schema)

-- 1. Append-only trigger: prevents UPDATE and DELETE on audit_logs
-- Note: PostgreSQL superusers CAN bypass triggers — this is acceptable for emergency
-- DB maintenance, and such access is itself logged by PostgreSQL's own audit mechanisms.
CREATE OR REPLACE FUNCTION audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only: % operations are not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- 2. TRUNCATE protection: prevents TRUNCATE from wiping the entire audit trail
-- Row-level triggers do NOT fire on TRUNCATE, so a separate statement-level trigger is needed.
CREATE TRIGGER trg_audit_logs_no_truncate
BEFORE TRUNCATE ON audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_immutable();

-- 3. Index on created_at for efficient hash chain verification (ORDER BY created_at ASC)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at ASC);

-- 3. Backfill existing records with hash chain
-- This must be run AFTER the columns are added via db:push but BEFORE the trigger is active.
-- Since the trigger blocks UPDATEs, backfill must happen before trigger creation.
-- In practice, run this script with the trigger CREATE statements commented out first,
-- then apply the trigger after backfill. Or use the migration script (scripts/migrate-audit-immutable.ts).
