# RareDiseaseCF On-Chain Program

Isolated Anchor workspace for **campaign metadata + USDC vault custody** on Solana Devnet or Mainnet.

**Hard rules:** no PHI on-chain; settlement pays **only** the immutable registered `provider_wallet` token account; the API has no simulated path — every donation and payout is a real transaction on the configured cluster.

## Account diagram

```text
                    ┌─────────────────────┐
                    │  PlatformConfig PDA │
                    │  seeds: ["platform- │
                    │          config"]   │
                    │  admin, usdc_mint   │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ VerifierRegistry│  │ ProviderRegistry│  │   Campaign PDA  │
│ ["verifier", wk]│  │ ["provider", wk]│  │ ["campaign", id]│
└─────────────────┘  └─────────────────┘  │ gap, raised,    │
                                          │ provider_wallet │
                                          │ milestone_mask  │
                                          └────────┬────────┘
                                                   │ authority
                                                   ▼
                                          ┌─────────────────┐
                                          │  Vault (SPL ATA)│
                                          │ ["vault", camp] │
                                          │ mint = USDC     │
                                          └────────┬────────┘
                                                   │ settle_milestone /
                                                   │ release_provider_payment
                                                   ▼
                                          ┌─────────────────┐
                                          │ Provider USDC   │
                                          │ ATA (owner MUST │
                                          │ = provider_wallet)
                                          └─────────────────┘
```

### Milestone settle (Day 7)

| Off-chain (Postgres) | On-chain |
|---|---|
| `LOCKED → ELIGIBLE → APPROVED → SETTLED` | `settle_milestone(percent)` sets bit in `milestone_settled_mask` |
| Admin Settle via EscrowService | Vault → provider ATA for **tranche** only |
| Admin Settle | API relayer signs `settle_milestone` with the platform key |

### Expiry release (3-month rule)

Campaigns run at most **90 days** (`MAX_CAMPAIGN_DURATION_SECS`, enforced in `create_campaign`).
After `expires_at`, `release_expired_funds` moves **the whole remaining vault balance** to the
registered provider (hospital) wallet — e.g. a campaign that raised only 23% pays out that 23%.

- Permissionless: any signer may call it, but the destination is fixed to `campaign.provider_wallet`, so funds can never get stuck or be redirected.
- No donor refunds by design.
- Marks the campaign `Settled`; a second call fails with `CampaignAlreadySettled`.
- The API sweeper (`EXPIRY_SWEEP_INTERVAL_MINUTES`) calls it automatically.

Percents: **25 / 50 / 75 / 100**. Bits: bit0=25, bit1=50, bit2=75, bit3=100.  
Requires `amount_raised ≥ threshold`; destination bound to `campaign.provider_wallet`; never auto-fires.

Full-gap `release_provider_payment` remains for Fulfilled campaigns with **mask == 0** (no tranche settles yet).

## PDA seed table

| Account | Seeds |
|---|---|
| PlatformConfig | `["platform-config"]` |
| VerifierRegistry | `["verifier", verifier_wallet]` |
| ProviderRegistry | `["provider", provider_wallet]` |
| Campaign | `["campaign", campaign_id]` |
| Vault token account | `["vault", campaign_pubkey]` |

Seeds never include patient identity, medical data, document hashes, or database UUIDs.

## Instruction table

| Instruction | Authority | Effect |
|---|---|---|
| `initialize_platform` | Admin (once) | Create PlatformConfig |
| `upsert_verifier` | Admin | Verifier registry |
| `upsert_provider` | Admin | Provider registry |
| `create_campaign` | Active verifier | Draft campaign PDA |
| `approve_campaign` | Campaign verifier | Draft → Approved; init vault |
| `donate_usdc` | Donor | SPL transfer into vault; bump `amount_raised` |
| `confirm_fulfillment` | Registered provider | Approved → Fulfilled (full-gap path) |
| `release_provider_payment` | Admin | Full gap vault→provider (mask must be 0) |
| `settle_milestone` | Admin | One tranche vault→provider; set mask bit |
| `release_expired_funds` | Anyone (after expiry) | Entire remaining vault→provider; status Settled |

## Campaign account fields (no PHI)

`campaign_id`, `status`, `verifier_wallet`, `provider_wallet`, `usdc_mint`, `verified_funding_gap`, `amount_raised`, `expires_at`, `approved_at`, `fulfilled_at`, `settled_at`, `settled_amount`, **`milestone_settled_mask`**, `bump`, `vault_bump`, `version` (schema **v2**).

## Linux Docker validate gate

Windows host `cargo check` does **not** replace SBF build + localnet tests.

```powershell
cd onchain
npm run validate:linux-docker
```

Entrypoint: `scripts/docker-validate-entrypoint.sh` → `cargo check` → `check:privacy` → `anchor build` → `anchor test`.

Host-side unit tests for tranche math (no validator):

```bash
cd onchain
cargo test -p rarediseasecf --lib milestones
```

## Client path

- `src/lib/rarediseaseProgram.ts` → browser `donateUsdc` (donor wallet signs `donate_usdc`)
- `server/chain/solanaRelayer.ts` → server-signed `upsert_provider` + `create_campaign` + `approve_campaign` (on hospital approval), `settle_milestone`, `release_expired_funds`, and on-chain donation verification
- `server/escrow/escrowService.ts` → on-chain custody via the relayer (devnet | mainnet-beta)
- `server/milestones/milestoneService.ts` → off-chain SETTLED + expiry release + sweeper

## Going live (Devnet or mainnet)

```bash
# 1. Deploy (Linux / Docker / WSL)
anchor deploy --provider.cluster devnet          # or mainnet-beta

# 2. Platform key = admin + verifier (same keypair the API uses)
ANCHOR_WALLET=./platform-authority.json USDC_MINT=<mint> SOLANA_RPC_URL=<rpc> \
  npx ts-node --transpile-only scripts/devnet-init-platform.ts
ANCHOR_WALLET=./platform-authority.json SOLANA_RPC_URL=<rpc> \
  npx ts-node --transpile-only scripts/devnet-upsert-registries.ts
```

Then set `SOLANA_CLUSTER`, `USDC_MINT`, `SOLANA_RPC_URL` and
`PLATFORM_AUTHORITY_SECRET_KEY` on the API (see `docs/ENV.md`).

## Program ID

`3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d`

Must match `declare_id!`, `Anchor.toml`, and deploy keypair pubkey. **Never commit seed phrases or private keys.**
