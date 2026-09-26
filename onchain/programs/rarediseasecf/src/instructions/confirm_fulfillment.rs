use anchor_lang::prelude::*;

use crate::errors::RareDiseaseError;
use crate::state::{Campaign, CampaignStatus, PlatformConfig, ProviderRegistry};

#[derive(Accounts)]
pub struct ConfirmFulfillment<'info> {
    pub provider: Signer<'info>,

    #[account(
        seeds = [PlatformConfig::SEED],
        bump = platform_config.bump,
        constraint = !platform_config.paused @ RareDiseaseError::PlatformPaused
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        seeds = [ProviderRegistry::SEED, provider.key().as_ref()],
        bump = provider_registry.bump,
        constraint = provider_registry.active @ RareDiseaseError::ProviderInactive,
        constraint = provider_registry.provider_wallet == provider.key()
            @ RareDiseaseError::UnauthorizedProvider
    )]
    pub provider_registry: Account<'info, ProviderRegistry>,

    #[account(
        mut,
        seeds = [Campaign::SEED, campaign.campaign_id.as_bytes()],
        bump = campaign.bump,
        constraint = campaign.provider_wallet == provider.key()
            @ RareDiseaseError::UnauthorizedProvider
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn confirm_fulfillment_handler(ctx: Context<ConfirmFulfillment>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;

    require!(
        campaign.status == CampaignStatus::Approved,
        RareDiseaseError::InvalidCampaignState
    );
    require!(
        campaign.amount_raised == campaign.verified_funding_gap,
        RareDiseaseError::CampaignNotFullyFunded
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < campaign.expires_at,
        RareDiseaseError::CampaignExpired
    );

    campaign.status = CampaignStatus::Fulfilled;
    campaign.fulfilled_at = clock.unix_timestamp;
    Ok(())
}
