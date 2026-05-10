-- Story 9-12 (Public Wizard + Pending-NIN + Magic-Link Email)
--
-- Two new tables:
--   1. magic_link_tokens — single-use auth tokens for new-public-registration,
--      pending-NIN return-to-complete, and existing-user login. Plaintext is
--      sent in email exactly once; this table stores SHA-256 hex of the token
--      (`token_hash`). Atomic UPDATE on `used_at` enforces single-use under
--      concurrent redemption (race-safe).
--
--   2. wizard_drafts — server-side per-email draft of the in-flight 5-step
--      wizard, so a respondent can resume across devices via magic link
--      (cross-device UX requires server-side; IndexedDB alone breaks it).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + IF NOT EXISTS on every index.
-- Multiple in-flight stories may collide on the migration filename slot;
-- this commit claims 0012.
--
-- Foreign keys are nullable to support the new-registration case where no
-- user/respondent record exists yet — the token is keyed by `email` until
-- redemption either creates or attaches the user.

-- ============================================================================
-- Table 1: magic_link_tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS "magic_link_tokens" (
  "id" UUID PRIMARY KEY,
  "token_hash" TEXT NOT NULL UNIQUE,
  "purpose" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "user_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
  "respondent_id" UUID REFERENCES "respondents"("id") ON DELETE CASCADE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at" TIMESTAMPTZ,
  "requested_ip" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT magic_link_tokens_purpose_check
    CHECK (purpose IN ('wizard_resume', 'pending_nin_complete', 'login'))
);

-- Lookup at redemption (already covered by UNIQUE constraint, but explicit name aids debugging).
CREATE INDEX IF NOT EXISTS "idx_magic_link_tokens_token_hash"
  ON "magic_link_tokens" ("token_hash");

-- Cleanup-sweep: find expired rows.
CREATE INDEX IF NOT EXISTS "idx_magic_link_tokens_expires_at"
  ON "magic_link_tokens" ("expires_at");

-- "Any unused token for this email + purpose?" — supports rate-limit-aware reuse.
CREATE INDEX IF NOT EXISTS "idx_magic_link_tokens_email_purpose"
  ON "magic_link_tokens" ("email", "purpose");


-- ============================================================================
-- Table 2: wizard_drafts
-- ============================================================================

CREATE TABLE IF NOT EXISTS "wizard_drafts" (
  "id" UUID PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "current_step" INTEGER NOT NULL DEFAULT 1,
  "form_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "last_updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wizard_drafts_current_step_range
    CHECK (current_step BETWEEN 1 AND 5)
);

-- Email already has UNIQUE so lookup is covered. Add expires_at for cleanup-sweep.
CREATE INDEX IF NOT EXISTS "idx_wizard_drafts_expires_at"
  ON "wizard_drafts" ("expires_at");
