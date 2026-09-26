use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::RareDiseaseError;
use crate::state::{Campaign, CampaignStatus, PlatformConfig};

#[derive(Accounts)]
pub struct ReleaseProviderPayment<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [PlatformConfig::SEED],
        bump = platform_config.bump,
        constraint = !platform_config.paused @ RareDiseaseError::PlatformPaused,
        constraint = platform_config.admin == admin.key() @ RareDiseaseError::UnauthorizedAdmin
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

    /// Must be a USDC token account owned by the immutable campaign provider wallet.
    #[account(
        mut,
        constraint = provider_token.mint == campaign.usdc_mint @ RareDiseaseError::InvalidUsdcMint,
        constraint = provider_token.owner == campaign.provider_wallet
            @ RareDiseaseError::InvalidProviderDestination
    )]
    pub provider_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn release_provider_payment_handler(ctx: Context<ReleaseProviderPayment>) -> Result<()> {
    require!(
        ctx.accounts.campaign.status != CampaignStatus::Settled,
        RareDiseaseError::CampaignAlreadySettled
    );
    require!(
        ctx.accounts.campaign.status == CampaignStatus::Fulfilled,
        RareDiseaseError::FulfillmentNotConfirmed
    );
    require!(
        ctx.accounts.campaign.milestone_settled_mask == 0
            && ctx.accounts.campaign.settled_amount == 0,
        RareDiseaseError::UseSettleMilestone
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.campaign.expires_at,
        RareDiseaseError::CampaignExpired
    );

    let amount = ctx.accounts.campaign.verified_funding_gap;
    require!(amount > 0, RareDiseaseError::InvalidFundingGap);
    require!(
        ctx.accounts.campaign.amount_raised == amount,
        RareDiseaseError::CampaignNotFullyFunded
    );
    require!(
        ctx.accounts.vault.amount >= amount,
        RareDiseaseError::InsufficientVaultBalance
    );

    let campaign_id = ctx.accounts.campaign.campaign_id.clone();
    let bump = ctx.accounts.campaign.bump;
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
    campaign.status = CampaignStatus::Settled;
    campaign.settled_at = clock.unix_timestamp;
    campaign.settled_amount = amount;
    require!(
        campaign.settled_amount == campaign.verified_funding_gap,
        RareDiseaseError::SettlementAmountMismatch
    );

    Ok(())
}
