ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "cover_image_ref" varchar(300);--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "cover_image_content_type" varchar(32);
