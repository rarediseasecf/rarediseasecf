# RareDiseaseCF — plan audit & roadmap

Mapped to your **original 12-day plan** (not the repo’s internal Day 7–10 numbering).

Audit date: 2026-09-21.

---

## Verdict

**Not finished.** Strong off-chain core and Anchor escrow program exist. App now wires donate / provider confirm / settle submit; still need Devnet deploy + proven Linux `anchor test`.

Rough completion vs your plan: **~60–65% product**, **~70% on-chain instructions**, **~55% wallet/Devnet demo wiring** (UI wired; Devnet deploy still missing).

---

## Status by your original day

| Your day | Focus | Status | What’s true today |
|---|---|---|---|
| **1** | Product boundary / setup | **PARTIAL** | App + `server/` + `onchain/` + Docker Postgres; privacy language in README; Devnet RPC in `.env.example`. Missing dedicated `requirements.md` / threat-model doc. |
| **2** | Patient private submission | **PARTIAL** | Multi-step form, offline case create, **no wallet required**. File upload **not enabled** (demo stub). |
| **3** | Reviewer dashboard | **PARTIAL** | Case list, approve/reject/clarify, gap calculator, provider select. **No** document viewer / signed URLs (no uploads). |
| **4** | Backend / access / public API | **PARTIAL** | Schema, patient + reviewer sessions, audit events, `RD-*` IDs, public campaign APIs. **No provider auth/RBAC**. |
| **5** | Anchor foundation | **PARTIAL** | SBF `anchor build` PASS in Linux Docker; localnet tests blocked on runner until mocha/ts-node fix re-proven. **Not deployed to Devnet**. |
| **6** | Approval / target lock | **DONE (on-chain + UI)** | `create_campaign` + `approve_campaign`. Reviewer “Lock funding on-chain” button submits both. |
| **7** | USDC escrow donation | **DONE (on-chain + UI)** | Vault + `donate_usdc`. Campaign donate UI calls it (needs `VITE_USDC_MINT` + approved on-chain campaign). |
| **8** | Donor experience | **PARTIAL** | Checkout + Explorer link after donate. No chain→API raised sync yet. |
| **9** | Provider portal / QR | **PARTIAL** | `/provider/:campaignId` + `confirm_fulfillment`. Shareable URL for phone/QR; no QR image lib. |
| **10** | Settlement | **PARTIAL** | Reviewer submits `release_provider_payment` then records proof (paste still a fallback). |
| **11** | Exception / security tests | **PARTIAL** | Many negative Anchor tests exist. **No** cancel/refund instructions or donor refund flow. |
| **12** | Polish / demo packaging | **NOT DONE** | No pitch deck, walkthrough script, seeded demo pack, or recorded video. No full Devnet rehearsal. |

### Critical blockers for the 90-second demo

1. Linux **`anchor test` PASS** (localnet proof) — Docker Desktop was off.
2. **Devnet deploy** + funded demo wallets + `VITE_USDC_MINT`.
3. On-chain **create/approve** — app button exists; needs Devnet platform + verifier registry.
4. Optional: sync on-chain `amount_raised` into public campaign progress.

---

## Recommended roadmap (finish in a good way)

Do this order — each step unlocks the next demo beat.

### Phase A — Prove the program (1–2 sessions)
- [ ] Green Docker/WSL: `cd onchain && npm run validate:linux-docker` → `anchor build` + `anchor test` PASS
- [ ] Keep SBF pins (`onchain/docs/sbf-dependency-pins.md`) after any `cargo update`
- [ ] Optional: Ubuntu 24.04 WSL for faster iteration than Docker sync

### Phase B — Devnet foundation (1 session)
- [ ] Deploy program ID `3ChG4eL5…` per `onchain/scripts/devnet-runbook.md`
- [ ] Initialize platform with Devnet USDC mint; upsert demo verifier + provider
- [ ] Document admin / verifier / provider / donor keypairs **locally only** (never commit)

### Phase C — Close the money path in the app (2–3 sessions) ≈ your D7–D8 + D10 wiring
- [x] Donor checkout: build + sign `donate_usdc` from `DonationSelector`
- [ ] Sync `amount_raised` into public campaign API (read chain or post-donate webhook/indexer lite)
- [x] Success screen + real Explorer proof link after donate
- [x] Settlement: reviewer/admin wallet submits `release_provider_payment`; paste remains fallback

### Phase D — Provider portal (1–2 sessions) ≈ your D9
- [x] Provider link `/provider/:campaignId`
- [ ] Provider wallet auth (same pattern as reviewer message-sign) — skipped; wallet connect is enough for demo
- [x] Confirm → `confirm_fulfillment`
- [ ] Simple QR image (URL shown on page for phone/QR apps)

### Phase E — Exceptions + polish (1–2 sessions) ≈ your D11–D12
- [ ] Minimal expiry/cancel/refund **only if judges require it** (keep tiny)
- [ ] Seeded demo script + 90s talk track matching your demo path
- [ ] Screenshots / short backup video if Devnet flakes
- [ ] Buffer: wallet UX copy, retries, judge architecture one-pager

---

## What “done” should mean for the hackathon

Minimum demo-ready definition:

```text
[ ] Linux anchor test PASS
[ ] Program live on Devnet
[ ] Patient submit without wallet (already mostly true)
[ ] Reviewer approve + publish (already true off-chain)
[ ] Donor sends real Devnet USDC via Phantom/Solflare
[ ] Provider confirms via portal/QR
[ ] Admin settles exact gap; Explorer link opens
[ ] Second settle fails
[ ] Backup video recorded
```

Until those boxes are checked, treat the plan as **in progress**, not finished.

---

## Note on numbering mismatch

Repo README “Day 7–10” = Anchor metadata → SBF gate → settlement workstream.  
Your plan’s Day 7–10 = escrow donate → donor UX → provider QR → settlement.

Use **this roadmap** (your original days) for product planning; use `onchain/docs/` for toolchain status.
