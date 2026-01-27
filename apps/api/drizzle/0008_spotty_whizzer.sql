CREATE TABLE IF NOT EXISTS "questionnaire_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"form_id" uuid NOT NULL,
	"file_blob" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questionnaire_forms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"file_hash" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"validation_warnings" text,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_forms_form_id_version" UNIQUE("form_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questionnaire_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"form_id_logical" text NOT NULL,
	"version" text NOT NULL,
	"questionnaire_form_id" uuid NOT NULL,
	"change_notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questionnaire_files" ADD CONSTRAINT "questionnaire_files_form_id_questionnaire_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."questionnaire_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questionnaire_forms" ADD CONSTRAINT "questionnaire_forms_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questionnaire_versions" ADD CONSTRAINT "questionnaire_versions_questionnaire_form_id_questionnaire_forms_id_fk" FOREIGN KEY ("questionnaire_form_id") REFERENCES "public"."questionnaire_forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questionnaire_versions" ADD CONSTRAINT "questionnaire_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_forms_form_id" ON "questionnaire_forms" ("form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_forms_status" ON "questionnaire_forms" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_forms_file_hash" ON "questionnaire_forms" ("file_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_versions_form_id_logical" ON "questionnaire_versions" ("form_id_logical");