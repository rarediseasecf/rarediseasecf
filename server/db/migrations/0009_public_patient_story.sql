ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "public_story" jsonb;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "public_story_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "public_story_consent_version" varchar(32);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "public_story_withdrawn_at" timestamp with time zone;
