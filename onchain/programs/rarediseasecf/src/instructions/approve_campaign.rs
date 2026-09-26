use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::RareDiseaseError;
use crate::state::{Campaign, CampaignStatus, PlatformConfig, ProviderRegistry, VerifierRegistry};

#[derive(Accounts)]
pub struct ApproveCampaign<'info> {
    #[account(mut)]
    pub verifier: Signer<'info>,

    #[account(
        seeds = [PlatformConfig::SEED],
        bump = platform_config.bump,
        constraint = !platform_config.paused @ RareDiseaseError::PlatformPaused
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        seeds = [VerifierRegistry::SEED, verifier.key().as_ref()],
        bump = verifier_registry.bump,
        constraint = verifier_registry.active @ RareDiseaseError::VerifierInactive,
        constraint = verifier_registry.verifier_wallet == verifier.key()
            @ RareDiseaseError::UnauthorizedVerifier
    )]
    pub verifier_registry: Account<'info, VerifierRegistry>,

    #[account(
        seeds = [ProviderRegistry::SEED, campaign.provider_wallet.as_ref()],
        bump = provider_registry.bump,
        constraint = provider_registry.active @ RareDiseaseError::ProviderInactive,
        constraint = provider_registry.provider_wallet == campaign.provider_wallet
            @ RareDiseaseError::InvalidProvider
    )]
    pub provider_registry: Account<'info, ProviderRegistry>,

    #[account(
        mut,
        seeds = [Campaign::SEED, campaign.campaign_id.as_bytes()],
        bump = campaign.bump,
        constraint = campaign.verifier_wallet == verifier.key()
            @ RareDiseaseError::UnauthorizedVerifier
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        constraint = usdc_mint.key() == campaign.usdc_mint @ RareDiseaseError::InvalidUsdcMint,
        constraint = usdc_mint.key() == platform_config.usdc_mint @ RareDiseaseError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    /// Campaign escrow vault — authority is the campaign PDA.
    #[account(
        init,
        payer = verifier,
        seeds = [Campaign::VAULT_SEED, campaign.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = campaign
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn approve_campaign_handler(ctx: Context<ApproveCampaign>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;

    require!(
        campaign.status != CampaignStatus::Approved,
        RareDiseaseError::CampaignAlreadyApproved
    );
    require!(
        campaign.status == CampaignStatus::Draft,
        RareDiseaseError::InvalidCampaignState
    );
    require!(
        campaign.verified_funding_gap > 0,
        RareDiseaseError::InvalidFundingGap
    );
    require!(
        campaign.amount_raised == 0,
        RareDiseaseError::UnexpectedAmountRaised
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < campaign.expires_at,
        RareDiseaseError::CampaignExpired
    );

    campaign.status = CampaignStatus::Approved;
    campaign.approved_at = clock.unix_timestamp;
    campaign.vault_bump = ctx.bumps.vault;

    Ok(())
}
