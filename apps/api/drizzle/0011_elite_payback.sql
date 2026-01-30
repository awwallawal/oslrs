CREATE TABLE IF NOT EXISTS "odk_sync_failures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"error_message" text NOT NULL,
	"error_code" text NOT NULL,
	"context" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_odk_sync_failures_unresolved" ON "odk_sync_failures" ("resolved_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_odk_sync_failures_operation" ON "odk_sync_failures" ("operation");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_odk_sync_failures_created_at" ON "odk_sync_failures" ("created_at");