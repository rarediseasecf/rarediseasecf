DROP INDEX IF EXISTS "donations_onchain_tx_hash_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "donations_onchain_tx_hash_uidx" ON "donations" USING btree ("tx_hash") WHERE "channel" <> 'simulated';--> statement-breakpoint
ALTER TABLE "donations" ALTER COLUMN "channel" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settlements" ALTER COLUMN "channel" DROP DEFAULT;
