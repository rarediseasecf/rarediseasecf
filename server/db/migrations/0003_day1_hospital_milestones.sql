CREATE TABLE IF NOT EXISTS "hospital_whitelist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"email_domain" varchar(255) NOT NULL,
	"contact_email" varchar(320),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deactivated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "magic_link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"hospital_id" uuid,
	"recipient_email" varchar(320) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"purpose" varchar(64) DEFAULT 'HOSPITAL_VERIFY' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "case_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"document_type" varchar(64) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_ref" varchar(512) NOT NULL,
	"upload_status" varchar(32) DEFAULT 'UPLOADED' NOT NULL,
	"verification_status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_draft_id" uuid NOT NULL,
	"percent" integer NOT NULL,
	"threshold_minor" bigint NOT NULL,
	"status" varchar(32) DEFAULT 'LOCKED' NOT NULL,
	"eligible_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_draft_id" uuid NOT NULL,
	"milestone_id" uuid,
	"settlement_reference" varchar(64) NOT NULL,
	"input_usdc_minor" bigint NOT NULL,
	"platform_fee_minor" bigint NOT NULL,
	"net_settlement_minor" bigint NOT NULL,
	"fiat_currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"destination_label" varchar(200) NOT NULL,
	"channel" varchar(32) DEFAULT 'simulated' NOT NULL,
	"transaction_signature" varchar(128),
	"status" varchar(32) DEFAULT 'COMPLETED' NOT NULL,
	"result_json" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_hospital_id_hospital_whitelist_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospital_whitelist"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_milestones" ADD CONSTRAINT "campaign_milestones_campaign_draft_id_campaign_drafts_id_fk" FOREIGN KEY ("campaign_draft_id") REFERENCES "public"."campaign_drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settlements" ADD CONSTRAINT "settlements_campaign_draft_id_campaign_drafts_id_fk" FOREIGN KEY ("campaign_draft_id") REFERENCES "public"."campaign_drafts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "settlements" ADD CONSTRAINT "settlements_milestone_id_campaign_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."campaign_milestones"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hospital_whitelist_email_domain_uidx" ON "hospital_whitelist" USING btree ("email_domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hospital_whitelist_active_idx" ON "hospital_whitelist" USING btree ("is_active");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "magic_link_tokens_token_hash_uidx" ON "magic_link_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "magic_link_tokens_case_id_idx" ON "magic_link_tokens" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "magic_link_tokens_recipient_idx" ON "magic_link_tokens" USING btree ("recipient_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_documents_case_id_idx" ON "case_documents" USING btree ("case_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "case_documents_type_idx" ON "case_documents" USING btree ("document_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_milestones_draft_percent_uidx" ON "campaign_milestones" USING btree ("campaign_draft_id","percent");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_milestones_status_idx" ON "campaign_milestones" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settlements_reference_uidx" ON "settlements" USING btree ("settlement_reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_campaign_draft_idx" ON "settlements" USING btree ("campaign_draft_id");
