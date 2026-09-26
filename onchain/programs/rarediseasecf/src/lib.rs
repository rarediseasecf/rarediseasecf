//! RareDiseaseCF — campaign metadata + USDC escrow/settlement (Devnet demo).
//! No PHI / patient wallets. Settlement pays the immutable registered provider only.

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod milestones;
pub mod state;

use instructions::*;

declare_id!("3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d");

/// Program account schema version constants.
pub const PLATFORM_VERSION: u8 = 1;
/// v2 adds `milestone_settled_mask` for tranche settles.
pub const CAMPAIGN_VERSION: u8 = 2;
/// Opaque campaign ID max bytes (e.g. K7MQP or legacy RD-8F29KQ).
pub const CAMPAIGN_ID_MAX_LEN: usize = 16;
/// Campaigns run at most ~6 months; afterwards `release_expired_funds` pays the provider.
pub const MAX_CAMPAIGN_DURATION_SECS: i64 = 180 * 24 * 60 * 60;

#[program]
pub mod rarediseasecf {
    use super::*;

    /// Create singleton PlatformConfig (admin + USDC mint). Once only.
    pub fn initialize_platform(ctx: Context<InitializePlatform>, usdc_mint: Pubkey) -> Result<()> {
        instructions::initialize_platform::initialize_platform_handler(ctx, usdc_mint)
    }

    /// Admin create/update verifier registry entry.
    pub fn upsert_verifier(
        ctx: Context<UpsertVerifier>,
        verifier_wallet: Pubkey,
        active: bool,
    ) -> Result<()> {
        instructions::manage_verifier::upsert_verifier_handler(ctx, verifier_wallet, active)
    }

    /// Admin create/update provider registry entry.
    pub fn upsert_provider(
        ctx: Context<UpsertProvider>,
        provider_wallet: Pubkey,
        active: bool,
    ) -> Result<()> {
        instructions::manage_provider::upsert_provider_handler(ctx, provider_wallet, active)
    }

    /// Active verifier creates a Draft campaign PDA (metadata only).
    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        campaign_id: String,
        provider_wallet: Pubkey,
        verified_funding_gap: u64,
        expires_at: i64,
    ) -> Result<()> {
        instructions::create_campaign::create_campaign_handler(
            ctx,
            campaign_id,
            provider_wallet,
            verified_funding_gap,
            expires_at,
        )
    }

    /// Original active verifier finalizes Draft → Approved and initializes the USDC vault.
    pub fn approve_campaign(ctx: Context<ApproveCampaign>) -> Result<()> {
        instructions::approve_campaign::approve_campaign_handler(ctx)
    }

    /// Donor transfers Devnet USDC into the campaign vault (no overfunding).
    pub fn donate_usdc(ctx: Context<DonateUsdc>, amount: u64) -> Result<()> {
        instructions::donate_usdc::donate_usdc_handler(ctx, amount)
    }

    /// Registered campaign provider confirms fulfillment/dispensing.
    pub fn confirm_fulfillment(ctx: Context<ConfirmFulfillment>) -> Result<()> {
        instructions::confirm_fulfillment::confirm_fulfillment_handler(ctx)
    }

    /// Platform admin releases exactly `verified_funding_gap` USDC to the immutable provider wallet.
    /// Prefer `settle_milestone` when using 25/50/75/100 tranches (requires mask == 0).
    pub fn release_provider_payment(ctx: Context<ReleaseProviderPayment>) -> Result<()> {
        instructions::release_provider_payment::release_provider_payment_handler(ctx)
    }

    /// Anyone releases one milestone tranche (25|50|75|100) to the registered provider only,
    /// once raised ≥ threshold; no PHI.
    pub fn settle_milestone(ctx: Context<SettleMilestone>, percent: u8) -> Result<()> {
        instructions::settle_milestone::settle_milestone_handler(ctx, percent)
    }

    /// After expiry, anyone may release the whole vault balance to the registered provider.
    pub fn release_expired_funds(ctx: Context<ReleaseExpiredFunds>) -> Result<()> {
        instructions::release_expired_funds::release_expired_funds_handler(ctx)
    }
}
