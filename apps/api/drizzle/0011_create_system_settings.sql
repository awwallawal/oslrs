-- prep-settings-landing-and-feature-flags: generic system_settings key-value table.
--
-- Pattern: 8 existing JSONB columns across the schema (audit.ts:11,
-- fraud-detections.ts:69-73, questionnaires.ts:65, submissions.ts:58); this
-- adds the 9th. NO secondary indexes — PK lookup on `key` is the only
-- access pattern; table is forecast at ~10-50 rows.
--
-- Idempotent: re-runs are no-ops (CREATE TABLE IF NOT EXISTS + seed INSERT
-- ON CONFLICT DO NOTHING).
--
-- The seed INSERT for `auth.sms_otp_enabled` requires an active super_admin
-- to set as initial `updated_by`. Production has 2 super_admin rows per
-- MEMORY.md (`awwallawal@gmail.com` + `admin@oyoskills.com`); the defensive
-- check below RAISES if zero exist (prevents silent FK violation).

-- 1. Table
CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" TEXT PRIMARY KEY,
  "value" JSONB NOT NULL,
  "description" TEXT,
  "updated_by" UUID NOT NULL REFERENCES "users"("id"),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Defensive seed: abort cleanly if no active super_admin exists
DO $$
DECLARE
  v_super_admin_id UUID;
BEGIN
  SELECT u.id INTO v_super_admin_id
    FROM users u
    INNER JOIN roles r ON u.role_id = r.id
    WHERE r.name = 'super_admin' AND u.status = 'active'
    ORDER BY u.created_at ASC
    LIMIT 1;

  IF v_super_admin_id IS NULL THEN
    RAISE EXCEPTION 'system_settings seed: no active super_admin found. Cannot set initial updated_by FK.';
  END IF;

  INSERT INTO "system_settings" (key, value, description, updated_by, updated_at, created_at)
  VALUES (
    'auth.sms_otp_enabled',
    'false'::jsonb,
    'When true, SMS OTP becomes available for public-user auth (requires SMS provider configured).',
    v_super_admin_id,
    now(),
    now()
  )
  ON CONFLICT ("key") DO NOTHING;
END $$;
