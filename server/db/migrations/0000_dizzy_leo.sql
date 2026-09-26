CREATE TABLE "case_access_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "case_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"metadata_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_case_id" varchar(16) NOT NULL,
	"status" varchar(32) DEFAULT 'UNDER_REVIEW' NOT NULL,
	"provider_cost_minor" bigint NOT NULL,
	"external_assistance_minor" bigint NOT NULL,
	"patient_contribution_minor" bigint NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"encryption_key_id" varchar(64) NOT NULL,
	"encrypted_private_payload" text NOT NULL,
	"private_payload_iv" text NOT NULL,
	"private_payload_auth_tag" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_access_sessions" ADD CONSTRAINT "case_access_sessions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_audit_events" ADD CONSTRAINT "case_audit_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "case_access_sessions_token_hash_uidx" ON "case_access_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "case_access_sessions_case_id_idx" ON "case_access_sessions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_audit_events_case_id_idx" ON "case_audit_events" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_public_case_id_uidx" ON "cases" USING btree ("public_case_id");--> statement-breakpoint
CREATE INDEX "cases_submitted_at_idx" ON "cases" USING btree ("submitted_at");