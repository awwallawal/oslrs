CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lgas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lgas_name_unique" UNIQUE("name"),
	CONSTRAINT "lgas_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"full_name" text NOT NULL,
	"password_hash" text,
	"nin" text,
	"date_of_birth" date,
	"home_address" text,
	"bank_name" text,
	"account_number" text,
	"account_name" text,
	"next_of_kin_name" text,
	"next_of_kin_phone" text,
	"live_selfie_original_url" text,
	"live_selfie_id_card_url" text,
	"liveness_score" text,
	"live_selfie_verified_at" timestamp with time zone,
	"role_id" uuid NOT NULL,
	"lga_id" uuid,
	"status" text DEFAULT 'invited' NOT NULL,
	"invitation_token" text,
	"invited_at" timestamp with time zone,
	"email_verification_token" text,
	"email_verification_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"current_session_id" uuid,
	"password_reset_token" text,
	"password_reset_expires_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0,
	"locked_until" timestamp with time zone,
	"is_seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_nin_unique" UNIQUE("nin"),
	CONSTRAINT "users_invitation_token_unique" UNIQUE("invitation_token"),
	CONSTRAINT "users_email_verification_token_unique" UNIQUE("email_verification_token"),
	CONSTRAINT "users_password_reset_token_unique" UNIQUE("password_reset_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_resource" text,
	"target_id" uuid,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questionnaire_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"form_id" uuid NOT NULL,
	"file_blob" "bytea" NOT NULL,
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
	"form_schema" jsonb,
	"is_native" boolean DEFAULT false,
	"native_published_at" timestamp with time zone,
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
CREATE TABLE IF NOT EXISTS "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submission_uid" text NOT NULL,
	"form_xml_id" text NOT NULL,
	"submitter_id" text,
	"raw_data" jsonb,
	"gps_latitude" double precision,
	"gps_longitude" double precision,
	"submitted_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'webapp' NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submissions_submission_uid_unique" UNIQUE("submission_uid")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_lga_id_lgas_id_fk" FOREIGN KEY ("lga_id") REFERENCES "public"."lgas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
CREATE INDEX IF NOT EXISTS "idx_versions_form_id_logical" ON "questionnaire_versions" ("form_id_logical");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_submission_uid_idx" ON "submissions" ("submission_uid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_form_xml_id_idx" ON "submissions" ("form_xml_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_processed_idx" ON "submissions" ("processed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_submitted_at_idx" ON "submissions" ("submitted_at");