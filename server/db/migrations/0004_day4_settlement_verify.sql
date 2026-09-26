-- Day 4: encrypted settlement destination + campaign verification badge fields
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "encrypted_settlement_payload" text;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "settlement_payload_iv" text;
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "settlement_payload_auth_tag" text;
--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD COLUMN IF NOT EXISTS "verification_status" varchar(32) DEFAULT 'UNVERIFIED' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD COLUMN IF NOT EXISTS "verifier_email" varchar(320);
--> statement-breakpoint
ALTER TABLE "campaign_drafts" ALTER COLUMN "review_decision_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_drafts" ALTER COLUMN "provider_id" DROP NOT NULL;
