-- Story 3.4: Create respondents table for extracted identity data
-- NIN uniqueness enforced at DB level for deduplication across submissions

CREATE TABLE IF NOT EXISTS "respondents" (
  "id" uuid PRIMARY KEY,
  "nin" text UNIQUE NOT NULL,
  "first_name" text,
  "last_name" text,
  "date_of_birth" text,
  "phone_number" text,
  "lga_id" text,
  "consent_marketplace" boolean NOT NULL DEFAULT false,
  "consent_enriched" boolean NOT NULL DEFAULT false,
  "source" text NOT NULL DEFAULT 'enumerator',
  "submitter_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- NIN unique constraint already creates an implicit index — no additional index needed
CREATE INDEX IF NOT EXISTS "idx_respondents_lga_id" ON "respondents" ("lga_id");
CREATE INDEX IF NOT EXISTS "idx_respondents_created_at" ON "respondents" ("created_at");
