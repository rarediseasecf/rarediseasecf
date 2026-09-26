ALTER TABLE "campaign_drafts" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD COLUMN "published_by_reviewer_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD COLUMN "public_title" varchar(200);--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD COLUMN "public_summary" text;--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_published_by_reviewer_id_reviewer_registry_id_fk" FOREIGN KEY ("published_by_reviewer_id") REFERENCES "public"."reviewer_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_drafts_publication_published_at_idx" ON "campaign_drafts" USING btree ("status","published_at");