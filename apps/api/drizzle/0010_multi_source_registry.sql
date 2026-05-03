-- Story 11-1: Multi-Source Registry Schema Foundation
--
-- This migration is the human-readable audit trail for Story 11-1. Per the
-- project's effective deploy mechanism (see ci-cd.yml line ~695), Drizzle
-- `db:push` handles schema diffs and idempotent migrate-*.ts scripts handle
-- raw SQL that Drizzle cannot express (CHECK constraints, partial unique
-- indexes). This file is NOT executed directly by the deploy pipeline; it
-- is the canonical SQL representation kept for code review + audit.
--
-- Effective application path:
--   1. `pnpm --filter @oslsr/api db:push` applies (from Drizzle schema):
--        - CREATE TABLE import_batches
--        - ALTER TABLE respondents (drop NOT NULL on nin, drop legacy UNIQUE,
--          add status / external_reference_id / import_batch_id / imported_at)
--        - CREATE INDEX idx_respondents_status / _source / _import_batch
--   2. `pnpm tsx scripts/migrate-multi-source-registry-init.ts` applies (raw):
--        - Status CHECK constraint
--        - Partial unique index on (nin) WHERE nin IS NOT NULL
--
-- Migration order (applies in a single transaction at the script level):

-- 1. CREATE TABLE import_batches (db:push handles via Drizzle schema)
CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" uuid PRIMARY KEY,
  "source" text NOT NULL,
  "source_description" text,
  "original_filename" text NOT NULL,
  "file_hash" text NOT NULL UNIQUE,
  "file_size_bytes" integer NOT NULL,
  "parser_used" text NOT NULL,
  "rows_parsed" integer NOT NULL DEFAULT 0,
  "rows_inserted" integer NOT NULL DEFAULT 0,
  "rows_matched_existing" integer NOT NULL DEFAULT 0,
  "rows_skipped" integer NOT NULL DEFAULT 0,
  "rows_failed" integer NOT NULL DEFAULT 0,
  "failure_report" jsonb,
  "lawful_basis" text NOT NULL,
  "lawful_basis_note" text,
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id"),
  "uploaded_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS "idx_import_batches_source" ON "import_batches" ("source");
CREATE INDEX IF NOT EXISTS "idx_import_batches_status" ON "import_batches" ("status");
CREATE INDEX IF NOT EXISTS "idx_import_batches_uploaded_by" ON "import_batches" ("uploaded_by");

-- 2. ALTER TABLE respondents — relax NIN, add status + provenance columns (db:push handles)
ALTER TABLE "respondents" ALTER COLUMN "nin" DROP NOT NULL;
-- The legacy inline UNIQUE constraint on respondents.nin (created in 0002) is
-- dropped by db:push when `.unique()` is removed from the Drizzle schema. The
-- exact pre-existing constraint name varies (Postgres default `respondents_nin_key`
-- vs Drizzle-managed `respondents_nin_unique`); the init script handles both.

ALTER TABLE "respondents"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
ALTER TABLE "respondents"
  ADD COLUMN IF NOT EXISTS "external_reference_id" text;
ALTER TABLE "respondents"
  ADD COLUMN IF NOT EXISTS "import_batch_id" uuid REFERENCES "import_batches"("id") ON DELETE SET NULL;
ALTER TABLE "respondents"
  ADD COLUMN IF NOT EXISTS "imported_at" timestamp with time zone;

-- 3. New indexes on respondents (db:push handles)
CREATE INDEX IF NOT EXISTS "idx_respondents_status" ON "respondents" ("status");
CREATE INDEX IF NOT EXISTS "idx_respondents_source" ON "respondents" ("source");
CREATE INDEX IF NOT EXISTS "idx_respondents_import_batch" ON "respondents" ("import_batch_id");

-- 4. Status CHECK constraint (NOT db:push — applied by migrate-multi-source-registry-init.ts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'respondents_status_check'
      AND conrelid = 'respondents'::regclass
  ) THEN
    ALTER TABLE "respondents"
      ADD CONSTRAINT "respondents_status_check"
        CHECK (status IN ('active', 'pending_nin_capture', 'nin_unavailable', 'imported_unverified'));
  END IF;
END $$;

-- 5. Partial unique index on NIN (NOT db:push — applied by migrate-multi-source-registry-init.ts)
-- FR21 stays in force — every NIN-carrying row remains unique. Rows without
-- NIN (status='pending_nin_capture' or imported rows from a source that did
-- not carry NIN) do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS "respondents_nin_unique_when_present"
  ON "respondents" ("nin")
  WHERE "nin" IS NOT NULL;

-- 6. Status CHECK constraint on import_batches (NOT db:push — applied by migrate-multi-source-registry-init.ts)
-- Mirrors respondents_status_check above. Drizzle's text('status', { enum: ... })
-- types the TS surface but does NOT emit a Postgres CHECK. Added by code-review M1.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'import_batches_status_check'
      AND conrelid = 'import_batches'::regclass
  ) THEN
    ALTER TABLE "import_batches"
      ADD CONSTRAINT "import_batches_status_check"
        CHECK (status IN ('active', 'rolled_back'));
  END IF;
END $$;

-- 7. Composite index on submissions(enumerator_id, submitted_at) — added by
-- AC#11 EXPLAIN audit. Speeds up Epic 5.6a productivity aggregation + Story
-- 11-1 submission lineage queries. Story 5.6a is already shipped; this is the
-- "fix in this story's migration" path per AC#11.
CREATE INDEX IF NOT EXISTS "idx_submissions_enumerator_submitted_at"
  ON "submissions" ("enumerator_id", "submitted_at");
