CREATE TABLE IF NOT EXISTS "odk_app_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"odk_app_user_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"token_iv" text NOT NULL,
	"odk_project_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "odk_app_users_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "odk_app_users" ADD CONSTRAINT "odk_app_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
