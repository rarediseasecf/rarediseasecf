//! Releases one milestone tranche (25/50/75/100) from vault → registered provider as soon as
//! raised ≥ threshold. Permissionless: the threshold is checked here and the destination is
//! fixed to `campaign.provider_wallet`, so anyone (platform, hospital, donor) may trigger it.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::RareDiseaseError;
use crate::milestones::{
    all_milestones_settled, is_milestone_settled, threshold_amount, tranche_amount,
    with_milestone_settled,
};
use crate::state::{Campaign, CampaignStatus, PlatformConfig};

#[derive(Accounts)]
pub struct SettleMilestone<'info> {
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

    /// Must be owned by the immutable registered provider wallet.
    #[account(
        mut,
        constraint = provider_token.mint == campaign.usdc_mint @ RareDiseaseError::InvalidUsdcMint,
        constraint = provider_token.owner == campaign.provider_wallet
            @ RareDiseaseError::InvalidProviderDestination
    )]
    pub provider_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn settle_milestone_handler(ctx: Context<SettleMilestone>, percent: u8) -> Result<()> {
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
        clock.unix_timestamp < campaign.expires_at,
        RareDiseaseError::CampaignExpired
    );

    require!(
        !is_milestone_settled(campaign.milestone_settled_mask, percent)?,
        RareDiseaseError::MilestoneAlreadySettled
    );

    let threshold = threshold_amount(campaign.verified_funding_gap, percent)?;
    require!(
        campaign.amount_raised >= threshold,
        RareDiseaseError::MilestoneNotEligible
    );

    let tranche = tranche_amount(campaign.verified_funding_gap, percent)?;
    require!(tranche > 0, RareDiseaseError::InvalidFundingGap);

    let remaining_cap = campaign
        .amount_raised
        .min(campaign.verified_funding_gap)
        .saturating_sub(campaign.settled_amount);
    require!(
        tranche <= remaining_cap,
        RareDiseaseError::MilestoneOverSettle
    );
    require!(
        ctx.accounts.vault.amount >= tranche,
        RareDiseaseError::InsufficientVaultBalance
    );

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
    token::transfer(cpi, tranche)?;

    let campaign = &mut ctx.accounts.campaign;
    campaign.milestone_settled_mask =
        with_milestone_settled(campaign.milestone_settled_mask, percent)?;
    campaign.settled_amount = campaign
        .settled_amount
        .checked_add(tranche)
        .ok_or_else(|| error!(RareDiseaseError::SettlementAmountMismatch))?;

    if all_milestones_settled(campaign.milestone_settled_mask)
        || campaign.settled_amount >= campaign.verified_funding_gap
    {
        campaign.status = CampaignStatus::Settled;
        campaign.settled_at = clock.unix_timestamp;
        require!(
            campaign.settled_amount == campaign.verified_funding_gap,
            RareDiseaseError::SettlementAmountMismatch
        );
    }

    Ok(())
}
