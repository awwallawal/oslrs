-- Migration: Remove ODK Central Integration
-- Sprint Change Proposal: SCP-2026-02-05-001
--
-- This migration removes all ODK-related database objects as part of
-- the transition to a native form system.
--
-- Changes:
-- 1. Drop odk_app_users table (ODK Central app user provisioning)
-- 2. Drop odk_sync_failures table (ODK sync error tracking)
-- 3. Remove odk_xml_form_id and odk_published_at from questionnaire_forms
--
-- Note: The submissions table retains odk_submission_id and odk_submitter_id
-- column names for migration compatibility, but these are repurposed for
-- the native form system (see submissions.ts schema comments).

-- Drop odk_app_users table and its constraints
DROP TABLE IF EXISTS "odk_app_users" CASCADE;

--> statement-breakpoint

-- Drop odk_sync_failures table and its indexes
DROP INDEX IF EXISTS "idx_odk_sync_failures_unresolved";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_odk_sync_failures_operation";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_odk_sync_failures_created_at";
--> statement-breakpoint
DROP TABLE IF EXISTS "odk_sync_failures" CASCADE;

--> statement-breakpoint

-- Remove ODK-specific columns from questionnaire_forms
ALTER TABLE "questionnaire_forms" DROP COLUMN IF EXISTS "odk_xml_form_id";
--> statement-breakpoint
ALTER TABLE "questionnaire_forms" DROP COLUMN IF EXISTS "odk_published_at";
