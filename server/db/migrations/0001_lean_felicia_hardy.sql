CREATE TABLE "campaign_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar(16) NOT NULL,
	"case_id" uuid NOT NULL,
	"review_decision_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'APPROVED_NOT_PUBLISHED' NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_display_name_snapshot" varchar(200) NOT NULL,
	"provider_payout_wallet_snapshot" varchar(64) NOT NULL,
	"verifier_wallet_address_snapshot" varchar(64) NOT NULL,
	"approved_provider_cost_minor" bigint NOT NULL,
	"verified_external_assistance_minor" bigint NOT NULL,
	"patient_contribution_minor" bigint NOT NULL,
	"verified_funding_gap_minor" bigint NOT NULL,
	"amount_raised_minor" bigint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"publication_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision_type" varchar(32) NOT NULL,
	"approved_provider_cost_minor" bigint,
	"verified_external_assistance_minor" bigint,
	"patient_contribution_minor" bigint,
	"verified_funding_gap_minor" bigint,
	"provider_id" uuid,
	"expiry_at" timestamp with time zone,
	"reason_code" varchar(64),
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"payout_wallet_address" varchar(64) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deactivated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviewer_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar(64) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"role" varchar(32) DEFAULT 'REVIEWER' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deactivated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviewer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_review_decision_id_case_review_decisions_id_fk" FOREIGN KEY ("review_decision_id") REFERENCES "public"."case_review_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_provider_id_provider_registry_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_review_decisions" ADD CONSTRAINT "case_review_decisions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_review_decisions" ADD CONSTRAINT "case_review_decisions_reviewer_id_reviewer_registry_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."reviewer_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_review_decisions" ADD CONSTRAINT "case_review_decisions_provider_id_provider_registry_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_sessions" ADD CONSTRAINT "reviewer_sessions_reviewer_id_reviewer_registry_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."reviewer_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_drafts_campaign_id_uidx" ON "campaign_drafts" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_drafts_case_id_uidx" ON "campaign_drafts" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_drafts_review_decision_id_uidx" ON "campaign_drafts" USING btree ("review_decision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_review_decisions_case_id_uidx" ON "case_review_decisions" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_registry_payout_wallet_uidx" ON "provider_registry" USING btree ("payout_wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "reviewer_registry_wallet_uidx" ON "reviewer_registry" USING btree ("wallet_address");--> statement-breakpoint
CREATE UNIQUE INDEX "reviewer_sessions_token_hash_uidx" ON "reviewer_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "reviewer_sessions_reviewer_id_idx" ON "reviewer_sessions" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");