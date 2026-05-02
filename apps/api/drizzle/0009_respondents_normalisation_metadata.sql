-- prep-input-sanitisation-layer: respondents normalisation infrastructure
--
-- This migration ships the SOFT additions only:
--   1. ADD COLUMN respondents.metadata JSONB (nullable, no default)
--      Used for `{ normalisation_warnings: string[], backfill_failed?: true }`.
--      Pattern matches established JSONB columns at:
--        - apps/api/src/db/schema/audit.ts:11
--        - apps/api/src/db/schema/fraud-detections.ts:69-73
--        - apps/api/src/db/schema/questionnaires.ts:65
--        - apps/api/src/db/schema/submissions.ts:58
--
--   2. ADD CONSTRAINT chk_respondents_phone_number_e164 NOT VALID
--      Enforces E.164 Nigerian phone format on FUTURE rows only. Existing
--      non-canonical rows are NOT immediately rejected — the operator runs
--      `pnpm --filter @oslsr/api tsx src/scripts/backfill-input-sanitisation.ts`
--      to canonicalise, then later runs `ALTER TABLE respondents VALIDATE
--      CONSTRAINT chk_respondents_phone_number_e164` to validate historic rows.
--
-- The hard tightening (date_of_birth TEXT → DATE) is deferred to a follow-up
-- migration after back-fill is verified clean on production. Doing the type
-- conversion in this migration would risk data loss on any DOB string that
-- fails the cast — see Risks #1 in `prep-input-sanitisation-layer.md`.

-- 1. Soft addition: metadata column for normalisation warnings + back-fill flags
ALTER TABLE "respondents"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

-- 2. Soft addition: phone E.164 CHECK constraint, NOT VALID
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_respondents_phone_number_e164'
      AND conrelid = 'respondents'::regclass
  ) THEN
    ALTER TABLE "respondents"
      ADD CONSTRAINT "chk_respondents_phone_number_e164"
        CHECK (phone_number IS NULL OR phone_number ~ '^\+234\d{10}$')
        NOT VALID;
  END IF;
END $$;
