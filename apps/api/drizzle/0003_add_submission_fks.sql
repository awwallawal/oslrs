-- Story 3.4: Add respondent_id and enumerator_id columns to submissions
-- respondent_id is a FK to respondents table; enumerator_id is text (matches submitter_id pattern)

ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "respondent_id" uuid REFERENCES "respondents"("id");
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "enumerator_id" text;

CREATE INDEX IF NOT EXISTS "idx_submissions_respondent_id" ON "submissions" ("respondent_id");
CREATE INDEX IF NOT EXISTS "idx_submissions_enumerator_id" ON "submissions" ("enumerator_id");
