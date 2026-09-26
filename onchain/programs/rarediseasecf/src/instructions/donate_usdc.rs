use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::RareDiseaseError;
use crate::state::{Campaign, CampaignStatus, PlatformConfig};

#[derive(Accounts)]
pub struct DonateUsdc<'info> {
    pub donor: Signer<'info>,

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
        constraint = donor_token.owner == donor.key(),
        constraint = donor_token.mint == campaign.usdc_mint @ RareDiseaseError::InvalidUsdcMint
    )]
    pub donor_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [Campaign::VAULT_SEED, campaign.key().as_ref()],
        bump = campaign.vault_bump,
        constraint = vault.mint == campaign.usdc_mint @ RareDiseaseError::InvalidUsdcMint,
        constraint = vault.owner == campaign.key()
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn donate_usdc_handler(ctx: Context<DonateUsdc>, amount: u64) -> Result<()> {
    require!(amount > 0, RareDiseaseError::InvalidDonationAmount);

    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Approved,
        RareDiseaseError::InvalidCampaignState
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < campaign.expires_at,
        RareDiseaseError::CampaignExpired
    );

    let new_raised = campaign
        .amount_raised
        .checked_add(amount)
        .ok_or(RareDiseaseError::OverfundingNotAllowed)?;
    require!(
        new_raised <= campaign.verified_funding_gap,
        RareDiseaseError::OverfundingNotAllowed
    );

    let cpi = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.donor_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.donor.to_account_info(),
        },
    );
    token::transfer(cpi, amount)?;

    campaign.amount_raised = new_raised;
    Ok(())
}
