# RareDiseaseCF

Privacy-first healthcare crowdfunding: verified funding gaps, hospital magic-link verification, milestone escrow, and institutional settlement — never unrestricted cash to patients.

---

## MVP product rules (locked)

| Rule | Detail |
|---|---|
| Funding gap | Whole healthcare gap = cost − assistance − patient contribution (server-calculated) |
| Verification | Whitelisted **hospital institutional email** receives a secure magic link; hospital staff verifies the case |
| Trust badge | After hospital verification + payout wallet capture: **Verified by `name@hospital.org`** |
| Case / campaign ID | **5-letter** opaque ID (e.g. `K7MQP`); legacy `RD-*` IDs still readable |
| Escrow | Milestone unlocks **25 / 50 / 75 / 100** — never auto-transfer on % alone |
| Settlement | Eligible milestone → approve → settle: USDC goes from on-chain escrow straight to the hospital's wallet (fiat payout coming soon) |
| Privacy | No PHI, prescriptions, or bank credentials on-chain |

### Roles

1. **Creator** — submit case + documents  
2. **Hospital verifier** — magic-link portal  
3. **Platform admin** — whitelist hospitals, monitor, approve milestones  
4. **Donor** — browse / donate  

Legacy wallet **reviewer** routes still exist until the hospital link flow fully replaces them.

### Networks

There is no simulated money path. The app runs on **Solana Devnet** or **Solana Mainnet** (`SOLANA_CLUSTER` + `VITE_SOLANA_NETWORK`). Every donation is a real USDC transfer into the campaign's on-chain escrow, verified by the API; every payout is an on-chain transaction to the hospital's wallet. Card/fiat donations and fiat payouts are "coming soon" and are rejected by the API.

In development only, if `SMTP_HOST` is not set, the hospital verify link is logged to the API console instead of emailed.

**Testing on Devnet:** enter `aa@aa.aa` as the institution email. After submitting, a popup shows the hospital's verification email with its single-use link, so a tester can play the hospital. The test inbox is disabled on `mainnet-beta` (the server rejects it and deactivates the test hospital), because it would let anyone verify their own campaign.

---

## Day 10 — Security pass, polish, deploy checklist

> **Status:** MVP. Production limitations are explicit.

- Full env list: [`docs/ENV.md`](docs/ENV.md) · template: [`.env.example`](.env.example)

### Gate

```powershell
npm run typecheck
npm run test:server
```

Full checklist: [`docs/day10-security-deploy.md`](docs/day10-security-deploy.md)

### Security (summary)

- Role checks: admin secret (timing-safe), hospital magic-link, reviewer session, case-access cookie
- Uploads: ≤5 MiB, PDF/PNG/JPG, MIME + magic-byte sniff, 2–8 docs
- Tokens: HMAC, ≤24h, single-use, case+email bound
- Frontend: no private keys — only public `VITE_*` RPC/program/mint

### Tests covered

Gap calc · milestones (threshold / double settle / over-settle) · settle references · on-chain donation verification (amount, missing/fake tx) · cluster config (devnet / mainnet-beta only) · email blacklist · hospital whitelist

### Deploy path (short)

1. Managed Postgres + `npm run db:migrate`
2. Host API with real `ADMIN_SECRET` + `DATA_ENCRYPTION_KEY`; frontend via Vercel (or similar) with `APP_ORIGIN`
3. Set `SOLANA_CLUSTER`, `USDC_MINT`, `PLATFORM_AUTHORITY_SECRET_KEY` (API) and matching `VITE_SOLANA_NETWORK`, `VITE_USDC_MINT` (frontend); initialise the platform on that cluster (`onchain/scripts/devnet-init-platform.ts` + `devnet-upsert-registries.ts`)

### Production limitations

Not a certified healthcare system. Documents are stored encrypted on local disk (`CASE_UPLOAD_DIR`). Fiat payouts (Circle / MoonPay) are not wired yet.

---

## Local walkthrough

### Setup (once)

```powershell
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run dev
```

Local default admin secret: `rdcf-demo-admin` (`ADMIN_SECRET` in `.env`).

1. `/submit` — create a case (documents + optional cover image). The hospital verify link is logged by the API in development.
2. Open the verify link — hospital approves, picks USDC payout wallet; campaign publishes.
3. `/campaigns/:id` — donate; `/admin/hospitals` — approve + settle eligible milestones.
4. `/transparency/:id` — public timeline and donor leaderboard.

### Transparency APIs

| Method | Path |
|---|---|
| `GET` | `/api/public/transparency/campaigns` |
| `GET` | `/api/public/transparency/campaigns/:campaignId` |
| `GET` | `/api/public/leaderboard?campaignId=` |

---

## Day 10 — Settlement

> **On-chain:** `donate_usdc`, `confirm_fulfillment`, and `release_provider_payment` are implemented in `onchain/`. Settlement pays **exactly** `verified_funding_gap` USDC from the campaign vault PDA to the **immutable** registered provider wallet, once, after fulfillment. No patient wallet path. No PHI on chain.

> **App:** Reviewer settlement card records a real tx signature and shows a Solana Explorer link (Devnet when configured). Backend is not the source of truth for balances.

### State sequence

`Approved` → full funding via `donate_usdc` → `confirm_fulfillment` (provider) → `release_provider_payment` (platform admin) → `Settled`

### Exact payment / one-time / destination rules

- Transfer amount is always the locked `verified_funding_gap` (no caller-supplied amount).
- Second settle fails with `CampaignAlreadySettled`.
- Destination token account must be owned by `campaign.provider_wallet` for `campaign.usdc_mint`.

### Tests

```powershell
cd onchain
npm run validate:linux-docker
```

### Limitations

Devnet/demo only; synthetic data; not production healthcare infrastructure; no claim of compliance or real-money custody readiness.

---

## Day 9 — SBF / localnet blocker isolation

> **Day 9 status (honest):** Linux **`anchor build` PASS** (Solana 2.1.0 image + dependency pins). Last validate failed only on TS test runner (`Unknown file extension ".ts"` with `"type": "module"`). Fix applied (removed ESM type; quoted mocha glob). Re-running `anchor test`.

See:

- [`onchain/docs/day9-sbf-blocker.md`](onchain/docs/day9-sbf-blocker.md) — precise blocker + paths
- [`onchain/docs/linux-wsl2-setup.md`](onchain/docs/linux-wsl2-setup.md) — Ubuntu WSL2 setup
- `onchain/scripts/validate-linux-docker.ps1` — Docker Linux `anchor build` + `anchor test`

```powershell
cd onchain
npm run validate:linux-docker
```

Re-run until Linux `anchor build` and `anchor test` both PASS before treating Day 9 as complete.

---

## Day 10 — Settlement status

On-chain settlement instructions are in `onchain/`. Green Day 9 Linux `anchor test` is still required before claiming the full Day 9/10 gate.

---

## Day 8 — Anchor SBF / localnet validation gate

> **Day 8 status:** Day 8 validates the metadata-only Anchor program in a Linux-compatible Solana development environment. The next payment milestone must not begin until Anchor SBF compilation and localnet tests pass. **Windows host-side `cargo check` does not replace successful Solana SBF compilation and localnet Anchor tests.**

### Required Linux gate (Day 9)

```text
Required Linux gate (Day 9):
[ ] anchor build succeeds (WSL2 or Docker)
[ ] anchor test succeeds
[ ] expected localnet tests pass
[ ] generated IDL is reviewed
[ ] no private/medical fields exist in account definitions
[ ] no transfer/escrow/donation instruction exists
[ ] no program deployment claim is made unless actually deployed
```

Setup guide: [`onchain/docs/linux-wsl2-setup.md`](onchain/docs/linux-wsl2-setup.md)

Host-only helper (does **not** prove SBF build):

```bash
npm run onchain:check
```

---

## Day 7 — Anchor campaign metadata program

> **Day 7 status:** An isolated Anchor workspace under `onchain/` supports platform config, verifier/provider registries, and campaign PDA create/approve on localnet. **No donations, escrow, or token transfers.** No patient data is written on-chain. The Vite/Express app is **not** wired to this program yet; public UI must not claim on-chain proof.


### What Day 7 adds

- Anchor program scaffold (`onchain/programs/rarediseasecf`)
- Instructions: `initialize_platform`, `upsert_verifier`, `upsert_provider`, `create_campaign`, `approve_campaign`
- On-chain campaign stores only opaque ID, status, verifier/provider wallets, USDC mint, verified funding gap, amount raised (0), expiry
- Localnet Anchor tests (when Solana/Anchor toolchain is installed)
- Manual Devnet deploy runbook only — no automatic deployment, no keys in repo

### What Day 7 does not do

- No USDC/SOL transfers, vaults, or donation UI transactions
- No backend/frontend sync of on-chain campaigns
- No “View on-chain proof” or explorer links in the public app
- No production / compliance / escrow claims

See [`onchain/README.md`](onchain/README.md) for PDA seeds, privacy rules, and build commands.

---

## Day 6 — Campaign publication (public browse)

> **Day 6 status:** Reviewers can explicitly publish an approved private campaign draft. Public list/detail APIs and pages read only `PUBLISHED` campaigns with a safe allowlisted serializer. Donation UI remains a non-payment preview. No Solana transactions.

### What Day 6 adds

- Separate reviewer **Publish campaign** action (approval alone does not publish)
- Real public campaign APIs: `GET /api/public/campaigns` and `GET /api/public/campaigns/:campaignId`
- Database-backed `/campaigns` and `/campaigns/:campaignId` pages
- Public-safe campaign serializer (explicit allowlist)
- Campaign publication audit events
- Replacement of static mock campaigns on production routes
- Donation amount + wallet confirmation UI still cannot move funds

### Public privacy model

**Public:** opaque campaign reference, generic title/summary, provider display name, verified funding goal, amount raised (always `0` in Day 6), remaining, funding percent (`0`), expiry, publication time.

**Private:** patient identity, care summary, documents, diagnosis, reviewer identity, provider payout wallet, case-access / session tokens, encrypted payloads, internal UUIDs.

### Reviewer publication test

1. Submit a synthetic case from `/submit`
2. Reviewer approves it (Day 5 path) → draft stays `APPROVED_NOT_PUBLISHED`
3. Open the approved case → **Campaign publication** card → confirm **Publish campaign**
4. Visit `/campaigns` and open the public campaign
5. Confirm no private treatment narrative, wallets, or documents appear
6. Confirm **Donation checkout coming next** stays disabled

### Public campaign test

1. Browse `/campaigns` with **no** wallet connected
2. Select a donation amount — only local UI changes
3. Connect/confirm a Devnet wallet — ownership message only; no funds move
4. No transaction approval / USDC transfer appears
5. Funding remains `0 USDC` / `0%`

### Security boundaries

- Publication is separate from approval and requires an active allowlisted reviewer session
- Public serializer uses an explicit allowlist (never spreads DB rows)
- Unpublished / unknown campaigns return the same public `404`
- Day 6 public APIs remain off-chain only (Day 7 Anchor program is a separate `onchain/` workspace, not wired here yet)

### Limitations

- Public campaigns are Devnet-demo publication only
- No donation transfer, on-chain escrow, provider confirmation, payout, or refunds
- No unpublish / expiry automation
- All case data remains synthetic

---

## Day 5 — Reviewer workspace (private approval)

> **Day 5 status:** Allowlisted Devnet reviewer wallets can confirm ownership, review private submitted cases, request clarification, reject, or approve. Approval atomically locks funding fields and creates a private campaign draft (`APPROVED_NOT_PUBLISHED`). Newly approved drafts are **not** public until Day 6 publication. No Solana transactions.


### What Day 5 adds

- Reviewer-specific wallet confirmation (separate from donor auth)
- PostgreSQL `reviewer_registry` + `provider_registry` (bootstrap from env)
- Durable HTTP-only reviewer sessions (`rdcf_reviewer_session`)
- Reviewer-only case list/detail APIs with server-side decryption after auth
- Structured clarification / rejection reason codes (no free-text medical notes)
- Server-validated funding gap: `approved cost − verified assistance − contribution`
- Immutable private campaign draft on approval (atomic transaction)
- Patient status pages for new case states
- No public campaign publication yet

### Environment variables

| Variable | Purpose |
|---|---|
| `REVIEWER_BOOTSTRAP_WALLETS` | Comma-separated allowlisted reviewer public keys |
| `PROVIDER_BOOTSTRAP_RECORDS` | JSON array of `{ displayName, payoutWalletAddress }` |
| `REVIEWER_SESSION_COOKIE_NAME` | Default `rdcf_reviewer_session` |
| `REVIEWER_SESSION_TTL_HOURS` | Default `8` |

### Local reviewer setup

1. Create or choose a **separate** Devnet test wallet for reviewer use.
2. Put only its **public** address in `REVIEWER_BOOTSTRAP_WALLETS`.
3. Create or choose a **separate** Devnet wallet for the demo provider payout destination.
4. Put only its public address in `PROVIDER_BOOTSTRAP_RECORDS` (JSON).
5. **Never** place a private key or seed phrase in `.env`.
6. Run `npm run db:migrate` and restart the API after changing bootstrap config.

```bash
REVIEWER_BOOTSTRAP_WALLETS=YourReviewerPublicKey
PROVIDER_BOOTSTRAP_RECORDS=[{"displayName":"DemoCare Specialty Pharmacy","payoutWalletAddress":"YourProviderPublicKey"}]
```

### Reviewer test path

1. Submit a synthetic case from `/submit`
2. Open `/reviewer` with the allowlisted reviewer wallet
3. Click **Confirm reviewer account** and approve the message (no funds move)
4. Open the submitted case
5. Approve with cost `5000`, assistance `2000`, contribution `500` → expected gap `2500`
6. Choose the active demo provider and a valid expiry (≥24h, ≤90 days)
7. **Approve and prepare campaign**
8. Confirm patient `/submit/status/...` shows approved private state
9. Confirm `/campaigns` does **not** show the draft until Day 6 publication
10. Confirm no on-chain transaction occurred

### Security boundaries

- Reviewer APIs are deny-by-default and require an active allowlisted session
- Donor session cookies never grant reviewer access
- Frontend route guards are UX only
- Approval math is server-side; client preview is not authoritative
- Approval + draft + status update are one DB transaction
- Campaign drafts store no treatment summary / patient identity
- Provider payout wallet is never shown on public pages
- No Solana transfer / program / Anchor code

### Limitations

- Bootstrap registries are hackathon/dev configuration only
- No admin UI to manage reviewers/providers
- No provider authentication or portal
- Public publication is handled by admin publish after hospital verify
- Local document upload + token-gated hospital download
- All data remains synthetic

---

## Day 4 — Private case intake (PostgreSQL)

Patients/caregivers submit synthetic private cases through `/submit`. Narrative fields are AES-256-GCM encrypted. HTTP-only case-access cookies grant owner status views only.

```bash
cp .env.example .env
# set DATA_ENCRYPTION_KEY, REVIEWER_BOOTSTRAP_WALLETS, PROVIDER_BOOTSTRAP_RECORDS
npm install
npm run db:up
npm run db:migrate
npm run dev
```

---

## Day 3 — Wallet ownership confirmation (Devnet)

Donor wallet confirmation remains separate from reviewer auth. Donor sessions stay in-memory.

---

## Routes

| Path | Description |
|---|---|
| `/` | Public homepage |
| `/campaigns` | Browse published campaigns |
| `/campaigns/:campaignId` | Campaign detail + donate UX |
| `/submit` | Private case intake (docs + hospital email) |
| `/submit/status` | Owner case status via case-access cookie |
| `/submit/status/:publicCaseId` | Owner case status |
| `/verify/:token` | Hospital magic-link verify portal |
| `/admin/hospitals` | Hospital whitelist + publish drafts |
| `/transparency` | Public timeline, updates, donor leaderboard |
| `/transparency/:campaignId` | Campaign-scoped transparency |
| `/reviewer` | Legacy reviewer workspace (gated) |
| `/reviewer/cases/:publicCaseId` | Reviewer case detail (authorized only) |

### Hospital verify API

| Method | Path |
|---|---|
| `GET` | `/api/hospital/reasons` |
| `GET` | `/api/hospital/verify/:token` |
| `GET` | `/api/hospital/verify/:token/documents/:documentId` |
| `POST` | `/api/hospital/verify/:token/approve` |
| `POST` | `/api/hospital/verify/:token/reject` |
| `GET` | `/api/admin/hospitals` |
| `POST` | `/api/admin/hospitals` |
| `DELETE` | `/api/admin/hospitals/:id` |
| `GET` | `/api/admin/campaigns` |
| `POST` | `/api/admin/campaigns/:campaignId/publish` |

### Reviewer API routes

| Method | Path |
|---|---|
| `POST` | `/api/reviewer/auth/challenge` |
| `POST` | `/api/reviewer/auth/verify` |
| `GET` | `/api/reviewer/auth/session` |
| `POST` | `/api/reviewer/auth/logout` |
| `GET` | `/api/reviewer/cases` |
| `GET` | `/api/reviewer/cases/:publicCaseId` |
| `POST` | `/api/reviewer/cases/:publicCaseId/request-clarification` |
| `POST` | `/api/reviewer/cases/:publicCaseId/reject` |
| `POST` | `/api/reviewer/cases/:publicCaseId/approve` |

Local document uploads land under `CASE_UPLOAD_DIR` (default `data/case-uploads`). Hospital approve seeds **LOCKED** milestones at 25/50/75/100. Donations auto-flip **ELIGIBLE** when raised ≥ threshold; admin **Approve** → **Settle (send USDC)** on `/admin/hospitals` — never auto-transfer. On-chain custody: `settle_milestone` + `release_expired_funds` (see [`onchain/README.md`](onchain/README.md)), signed by the server relayer — see [`docs/ENV.md`](docs/ENV.md#on-chain-escrow-required--server-only). Campaigns run 90 days; at expiry everything raised but unsettled goes to the hospital.

### Day 6 milestone APIs

| Method | Path |
|---|---|
| `GET` | `/api/admin/campaigns/published/milestones` |
| `GET` | `/api/admin/campaigns/:campaignId/milestones` |
| `POST` | `/api/admin/campaigns/:campaignId/milestones/:percent/approve` |
| `POST` | `/api/admin/campaigns/:campaignId/milestones/:percent/settle` |
| `POST` | `/api/admin/campaigns/:campaignId/settle-highest` |

Acceptance: raise to 50% → 25+50 `ELIGIBLE`, 75 still `LOCKED`. Public campaign detail shows the tracker from server state.

---

## Privacy

Do not enter real patient names, medical records, prescriptions, diagnoses, addresses, emails, phone numbers, or document hashes. Narrative case fields are encrypted at rest. Wallet addresses are truncated in the UI. Provider payout wallets are reviewer-only (truncated).

---

## Disclaimer

On **Devnet**, use test wallets and synthetic data only — Devnet USDC has no value. Before running on **Mainnet**, complete the mainnet checklist (program deploy/audit, hosting, legal review); mainnet donations are real money.
