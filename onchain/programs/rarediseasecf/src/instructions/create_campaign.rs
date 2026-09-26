use anchor_lang::prelude::*;

use crate::errors::RareDiseaseError;
use crate::state::{
    validate_campaign_id, Campaign, CampaignStatus, PlatformConfig, ProviderRegistry,
    VerifierRegistry,
};
use crate::{CAMPAIGN_VERSION, MAX_CAMPAIGN_DURATION_SECS};

#[derive(Accounts)]
#[instruction(campaign_id: String, provider_wallet: Pubkey)]
pub struct CreateCampaign<'info> {
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
        seeds = [ProviderRegistry::SEED, provider_wallet.as_ref()],
        bump = provider_registry.bump,
        constraint = provider_registry.active @ RareDiseaseError::ProviderInactive,
        constraint = provider_registry.provider_wallet == provider_wallet
            @ RareDiseaseError::InvalidProvider
    )]
    pub provider_registry: Account<'info, ProviderRegistry>,

    #[account(
        init,
        payer = verifier,
        space = Campaign::SPACE,
        seeds = [Campaign::SEED, campaign_id.as_bytes()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    pub system_program: Program<'info, System>,
}

pub fn create_campaign_handler(
    ctx: Context<CreateCampaign>,
    campaign_id: String,
    provider_wallet: Pubkey,
    verified_funding_gap: u64,
    expires_at: i64,
) -> Result<()> {
    validate_campaign_id(&campaign_id)?;

    require!(
        provider_wallet != Pubkey::default(),
        RareDiseaseError::InvalidProvider
    );
    require!(
        verified_funding_gap > 0,
        RareDiseaseError::InvalidFundingGap
    );

    let clock = Clock::get()?;
    require!(
        expires_at > clock.unix_timestamp
            && expires_at <= clock.unix_timestamp + MAX_CAMPAIGN_DURATION_SECS,
        RareDiseaseError::InvalidExpiry
    );

    let campaign = &mut ctx.accounts.campaign;
    campaign.campaign_id = campaign_id;
    campaign.status = CampaignStatus::Draft;
    campaign.verifier_wallet = ctx.accounts.verifier.key();
    campaign.provider_wallet = provider_wallet;
    campaign.usdc_mint = ctx.accounts.platform_config.usdc_mint;
    campaign.verified_funding_gap = verified_funding_gap;
    campaign.amount_raised = 0;
    campaign.expires_at = expires_at;
    campaign.approved_at = 0;
    campaign.fulfilled_at = 0;
    campaign.settled_at = 0;
    campaign.settled_amount = 0;
    campaign.milestone_settled_mask = 0;
    campaign.bump = ctx.bumps.campaign;
    campaign.vault_bump = 0;
    campaign.version = CAMPAIGN_VERSION;

    Ok(())
}
