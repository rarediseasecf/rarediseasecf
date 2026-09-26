# Day 10 — Security checklist & deploy readiness

## Security checklist (MVP)

| Control | Status | Notes |
|---|---|---|
| Admin role (`X-Admin-Secret`) | Pass | Timing-safe compare; required in production |
| Hospital magic-link | Pass | HMAC, ≤24h TTL, single-use, bound to case+email |
| Reviewer session | Pass | Allowlisted wallet + HTTP-only cookie |
| Case-access cookie | Pass | HttpOnly; binds to public case id |
| File uploads | Pass | 5 MiB, PDF/PNG/JPG MIME + magic bytes, 2–8 files |
| No private keys in frontend | Pass | Only `VITE_*` public RPC/program/mint |
| PHI on public/transparency | Pass | Sanitized timeline; docs never public |
| Donations | Pass | Only verified on-chain USDC transfers (vault, mint, exact amount); signatures can't be reused |

## Acceptance gate

```powershell
npm run typecheck
npm run test:server
```

Both must pass before any deploy.

## Local setup

```powershell
cp .env.example .env
# Set DATA_ENCRYPTION_KEY (32-byte base64), ADMIN_SECRET,
# SOLANA_CLUSTER, USDC_MINT, PLATFORM_AUTHORITY_SECRET_KEY
npm install
npm run db:up
npm run db:migrate
npm run dev
```

Env reference: [`ENV.md`](ENV.md) · template: [`.env.example`](../.env.example).

## Networks

There is no simulated mode. The API only runs against **devnet** or **mainnet-beta** (`SOLANA_CLUSTER`) and refuses to start without `USDC_MINT` and `PLATFORM_AUTHORITY_SECRET_KEY`.

| Surface | Behavior |
|---|---|
| Hospital email | SMTP in production; in development without `SMTP_HOST` the link is logged |
| Donations | USDC only, verified on-chain; card/fiat rejected (coming soon) |
| Milestone payout | `settle_milestone` sends USDC from escrow to the hospital wallet |
| Campaign expiry | `release_expired_funds` sends everything unsettled to the hospital |

## Production limitations (explicit)

- Not a certified healthcare system; not HIPAA/GDPR certified
- Document storage is encrypted local disk (`CASE_UPLOAD_DIR`), not object storage
- Fiat payouts (Circle / MoonPay) not wired yet

## Deploy checklist

### App + API

1. Build frontend: `npm run build` (static to Vercel / CDN)
2. Host Express API separately (Railway, Fly, Render, etc.) with `PORT`, `APP_ORIGIN`, `DATABASE_URL`
3. Set strong `ADMIN_SECRET`, `DATA_ENCRYPTION_KEY`, `MAGIC_LINK_HMAC_SECRET`
4. Set `APP_ORIGIN` to the public HTTPS origin (CORS + cookies)
5. Set `SOLANA_CLUSTER`, `SOLANA_RPC_URL`, `USDC_MINT`, `PLATFORM_AUTHORITY_SECRET_KEY` on the API and matching `VITE_SOLANA_NETWORK`, `VITE_USDC_MINT`, `VITE_PROGRAM_ID` on the frontend
6. Never commit `.env`; never put private keys in `VITE_*`

### Database

1. Provision managed Postgres
2. Set `DATABASE_URL`
3. Run `npm run db:migrate` against that database
4. Bootstrap hospitals / reviewers / providers via env JSON (public keys only)

### Solana program

1. `cd onchain && npm run validate:linux-docker` (or WSL) until `anchor build` + `anchor test` PASS
2. Deploy to the target cluster
3. Run `onchain/scripts/devnet-init-platform.ts` then `devnet-upsert-registries.ts` with the platform key
4. Keep a little SOL in the platform key for fees and rent
