# Devnet runbook (manual — Day 7)

**Never** put private keys or seed phrases in this repo, `.env`, frontend, or API.

This is a developer checklist only. It does not run during `npm install`, frontend build, or API startup.

## Prerequisites

- Solana CLI configured for Devnet with a funded keypair you control
- Anchor 0.31.x installed via AVM
- Program built: `cd onchain && anchor build`

## Steps

1. **Deploy program**
   ```bash
   cd onchain
   anchor deploy --provider.cluster devnet
   ```
   Note the deployed program ID. If it differs from `declare_id!`, sync keys and rebuild.

2. **Initialize PlatformConfig** (once)
   - Signer: your CLI wallet (becomes `admin`)
   - Argument: Devnet USDC mint pubkey (do not invent; use the official Devnet USDC mint you intend for later milestones)

3. **Upsert verifier**
   - Use the **public** allowlisted reviewer wallet from the off-chain app env
   - `active = true`
   - Admin signer only

4. **Upsert provider**
   - Use the **public** demo provider payout wallet from off-chain env
   - `active = true`
   - Do **not** surface this wallet in public UI

5. **Create synthetic campaign**
   - `campaign_id`: opaque `RD-*` (e.g. `RD-8F29KQ`)
   - `verified_funding_gap`: `2_500_000_000` (2,500 USDC)
   - `expires_at`: future Unix timestamp
   - Signer: active verifier

6. **Approve campaign**
   - Same verifier signer
   - Confirms Draft → Approved on-chain

## Verification

- Fetch campaign account; confirm status Approved, amount_raised = 0
- Confirm IDL / account layout has no patient fields
- Confirm no transfer instructions in the program

## Out of scope

- Frontend buttons, backend signing, explorer links, donations, escrow
