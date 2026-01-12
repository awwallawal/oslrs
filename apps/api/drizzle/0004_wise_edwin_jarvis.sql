ALTER TABLE "users" ADD COLUMN "live_selfie_original_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "live_selfie_id_card_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "liveness_score" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "live_selfie_verified_at" timestamp with time zone;