CREATE TABLE IF NOT EXISTS "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_draft_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"method" varchar(16) NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"display_name" varchar(120),
	"tx_hash" varchar(128),
	"status" varchar(32) DEFAULT 'CONFIRMED' NOT NULL,
	"channel" varchar(32) DEFAULT 'simulated' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "donations" ADD CONSTRAINT "donations_campaign_draft_id_campaign_drafts_id_fk" FOREIGN KEY ("campaign_draft_id") REFERENCES "public"."campaign_drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "donations_campaign_draft_idx" ON "donations" USING btree ("campaign_draft_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "donations_created_at_idx" ON "donations" USING btree ("created_at");
