ALTER TABLE "roles" ADD COLUMN "is_seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lgas" ADD COLUMN "code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "lgas" ADD COLUMN "is_seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lgas" ADD CONSTRAINT "lgas_code_unique" UNIQUE("code");