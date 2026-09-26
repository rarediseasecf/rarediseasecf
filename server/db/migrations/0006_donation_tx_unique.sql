CREATE UNIQUE INDEX IF NOT EXISTS "donations_onchain_tx_hash_uidx" ON "donations" USING btree ("tx_hash") WHERE "channel" = 'devnet';
