//! After a campaign expires, release everything left in the vault to the registered provider.
//! Permissionless: the destination is fixed to `campaign.provider_wallet`, so funds reach the
//! hospital even if the platform is unavailable. No refunds to donors by design.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::RareDiseaseError;
use crate::state::{Campaign, CampaignStatus, PlatformConfig};

#[derive(Accounts)]
pub struct ReleaseExpiredFunds<'info> {
    pub caller: Signer<'info>,

    #[account(
        seeds = [PlatformConfig::SEED],
        bump = platform_config.bump,
        constraint = !platform_config.paused @ RareDiseaseError::PlatformPaused
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        mut,
        seeds = [Campaign::SEED, campaign.campaign_id.as_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        constraint = usdc_mint.key() == campaign.usdc_mint @ RareDiseaseError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [Campaign::VAULT_SEED, campaign.key().as_ref()],
        bump = campaign.vault_bump,
        constraint = vault.mint == campaign.usdc_mint @ RareDiseaseError::InvalidUsdcMint,
        constraint = vault.owner == campaign.key()
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = provider_token.mint == campaign.usdc_mint @ RareDiseaseError::InvalidUsdcMint,
        constraint = provider_token.owner == campaign.provider_wallet
            @ RareDiseaseError::InvalidProviderDestination
    )]
    pub provider_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn release_expired_funds_handler(ctx: Context<ReleaseExpiredFunds>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;

    require!(
        campaign.status != CampaignStatus::Settled,
        RareDiseaseError::CampaignAlreadySettled
    );
    require!(
        campaign.status == CampaignStatus::Approved
            || campaign.status == CampaignStatus::Fulfilled,
        RareDiseaseError::InvalidCampaignState
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= campaign.expires_at,
        RareDiseaseError::CampaignNotExpired
    );

    let amount = ctx.accounts.vault.amount;
    require!(amount > 0, RareDiseaseError::NothingToRelease);

    let campaign_id = campaign.campaign_id.clone();
    let bump = campaign.bump;
    let seeds: &[&[u8]] = &[Campaign::SEED, campaign_id.as_bytes(), &[bump]];
    let signer = &[seeds];

    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.provider_token.to_account_info(),
            authority: ctx.accounts.campaign.to_account_info(),
        },
        signer,
    );
    token::transfer(cpi, amount)?;

    let campaign = &mut ctx.accounts.campaign;
    campaign.settled_amount = campaign
        .settled_amount
        .checked_add(amount)
        .ok_or_else(|| error!(RareDiseaseError::SettlementAmountMismatch))?;
    campaign.status = CampaignStatus::Settled;
    campaign.settled_at = clock.unix_timestamp;

    Ok(())
}
