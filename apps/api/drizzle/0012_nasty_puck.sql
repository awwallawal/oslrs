CREATE TABLE IF NOT EXISTS "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"odk_submission_id" text NOT NULL,
	"form_xml_id" text NOT NULL,
	"odk_submitter_id" text,
	"raw_data" jsonb,
	"gps_latitude" double precision,
	"gps_longitude" double precision,
	"submitted_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'webhook' NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submissions_odk_submission_id_unique" UNIQUE("odk_submission_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_odk_submission_id_idx" ON "submissions" ("odk_submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_form_xml_id_idx" ON "submissions" ("form_xml_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_processed_idx" ON "submissions" ("processed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_submitted_at_idx" ON "submissions" ("submitted_at");