# RareDiseaseCF — environment variables

Copy `.env.example` → `.env`. Do not commit real secrets.

Restart `npm run dev` after changing any `VITE_*` value (Vite bakes them at build time).

---

## Mode switches (set these first)

| Variable | Where | Required | Default | Purpose |
|---|---|---|---|---|
| `NODE_ENV` | API | No | (unset in dev) | `production` requires strong `ADMIN_SECRET` |
| `SOLANA_CLUSTER` | API | No | `devnet` | `devnet` \| `mainnet-beta`. There is no simulated mode — every donation and payout is a real on-chain transaction |
| `RATE_LIMIT_ENABLED` | API | No | `true` in production | Per-IP limits on submit / verify / donate / admin |
| `LEGACY_REVIEWER_ENABLED` | API | No | `true` when not production | Old wallet-reviewer APIs (`/api/reviewer/*`) |

---

## Frontend (`VITE_*` — public, safe in browser)

| Variable | Required | Example / notes |
|---|---|---|
| `VITE_SOLANA_RPC_URL` | No | Defaults to the public RPC for `VITE_SOLANA_NETWORK` |
| `VITE_SOLANA_NETWORK` | **Yes** | `devnet` or `mainnet-beta` — must match `SOLANA_CLUSTER` |
| `VITE_PROGRAM_ID` | No | Anchor program id (defaults to the deployed one) |
| `VITE_USDC_MINT` | **Yes** | Same value as `USDC_MINT` |

**Never** put private keys, seed phrases, `ADMIN_SECRET`, or `DATA_ENCRYPTION_KEY` in `VITE_*`.

---

## API core

| Variable | Required | Notes |
|---|---|---|
| `PORT` | No | Default `8787` |
| `APP_ORIGIN` | Yes (prod) | Must match browser origin, e.g. `https://your.app` |
| `DATABASE_URL` | **Yes** | Postgres connection string |
| `DATA_ENCRYPTION_KEY` | **Yes** | Base64 32 bytes — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `DATA_ENCRYPTION_KEY_ID` | No | Default `local-dev-v1` |
| `ADMIN_SECRET` | **Yes in production** | `X-Admin-Secret` for admin APIs; local default `rdcf-demo-admin` |

---

## Sessions / cookies

| Variable | Required | Default |
|---|---|---|
| `SESSION_COOKIE_NAME` | No | `rdcf_session` |
| `SESSION_TTL_HOURS` | No | `24` |
| `CHALLENGE_TTL_MINUTES` | No | `5` |
| `CASE_ACCESS_COOKIE_NAME` | No | `rdcf_case_access` |
| `CASE_ACCESS_TTL_DAYS` | No | `30` |
| `REVIEWER_SESSION_COOKIE_NAME` | No | `rdcf_reviewer_session` |
| `REVIEWER_SESSION_TTL_HOURS` | No | `8` |

---

## Bootstrap allowlists (public keys / hospital domains only)

| Variable | Required | Format |
|---|---|---|
| `REVIEWER_BOOTSTRAP_WALLETS` | For reviewer UI | Comma-separated Solana pubkeys |
| `PROVIDER_BOOTSTRAP_RECORDS` | For approve/settle | JSON `[{"displayName":"...","payoutWalletAddress":"..."}]` |
| `HOSPITAL_WHITELIST_BOOTSTRAP` | Optional extras | JSON hospital rows (3 demo hospitals always seed) |

---

## Hospital magic-link + SMTP

| Variable | Required | Notes |
|---|---|---|
| `MAGIC_LINK_HMAC_SECRET` | No | Derived from encryption key if unset |
| `MAGIC_LINK_TTL_HOURS` | No | Max `24` |
| `CASE_UPLOAD_DIR` | No | Default `data/case-uploads` |
| `SMTP_HOST` | **Yes in production** | Set → real email via nodemailer. Omit → link only logged (development). Production never logs the link |
| `SMTP_PORT` | No | `587` |
| `SMTP_SECURE` | No | `true` / `false` |
| `SMTP_USER` | No | |
| `SMTP_PASS` | No | |
| `SMTP_FROM` | No | Default `noreply@rarediseasecf.demo` |

---

## On-chain escrow (required) — server only

The API refuses to start without `USDC_MINT` and `PLATFORM_AUTHORITY_SECRET_KEY`.

The API signs campaign creation, milestone settles and expiry releases with one
platform key. It must be the program **admin** (`initialize_platform`) and a
registered **verifier** (`upsert_verifier`). Keep a little SOL in it for fees
and rent (~0.01 SOL per campaign).

| Variable | Required | Notes |
|---|---|---|
| `SOLANA_CLUSTER` | No | `devnet` (default) or `mainnet-beta` |
| `SOLANA_RPC_URL` | No | Defaults to the public RPC for the cluster; use a paid RPC for mainnet |
| `PROGRAM_ID` | No | Defaults to `3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d` |
| `USDC_MINT` | **Yes** | Devnet `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` · mainnet `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| `PLATFORM_AUTHORITY_SECRET_KEY` | **Yes** | JSON byte array (keypair file contents) or base58. **Never** in `VITE_*`, never committed |
| `EXPIRY_SWEEP_INTERVAL_MINUTES` | No | Default `60` — how often expired campaigns are paid out and any stalled milestone payouts are retried |

How money moves:

- Hospital approves → server creates + approves the campaign on-chain with the hospital's USDC wallet (6-month / 180-day window).
- Donation → the browser wallet sends USDC to the vault; the API verifies the transaction on-chain (success, correct vault, correct mint, exact amount) and rejects reused signatures. Card/fiat donations are rejected (coming soon).
- Donation crosses 25/50/75/100% → the server immediately sends `settle_milestone` for each reached milestone; that 25% tranche goes straight to the hospital wallet and the transaction is shown in the campaign's Milestone escrow section. The instruction is permissionless (threshold checked on-chain, destination fixed), so the hospital or anyone can trigger it if the platform is down. The periodic sweep retries any payout that failed.
- Campaign ends (6 months) → sweeper signs `release_expired_funds`; **everything raised but not yet paid out goes to the hospital** (e.g. 48% raised → 25% already paid at the milestone, the remaining 23% is paid now). Anyone can call this instruction too.

---

## Minimal local `.env` to boot

```env
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_SOLANA_NETWORK=devnet
VITE_PROGRAM_ID=3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d
VITE_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

PORT=8787
APP_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://rdcf_dev:rdcf_dev_password@localhost:5432/rarediseasecf_dev
DATA_ENCRYPTION_KEY=<paste-base64-32-bytes>
DATA_ENCRYPTION_KEY_ID=local-dev-v1
ADMIN_SECRET=rdcf-demo-admin

SOLANA_CLUSTER=devnet
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
PLATFORM_AUTHORITY_SECRET_KEY=<server-only keypair, JSON array or base58>
```

The platform key must be initialised once per cluster:
`onchain/scripts/devnet-init-platform.ts`, then `onchain/scripts/devnet-upsert-registries.ts`.