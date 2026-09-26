use anchor_lang::prelude::*;

use crate::errors::RareDiseaseError;
use crate::state::PlatformConfig;
use crate::PLATFORM_VERSION;

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = PlatformConfig::SPACE,
        seeds = [PlatformConfig::SEED],
        bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_platform_handler(
    ctx: Context<InitializePlatform>,
    usdc_mint: Pubkey,
) -> Result<()> {
    require!(
        usdc_mint != Pubkey::default(),
        RareDiseaseError::InvalidUsdcMint
    );

    let config = &mut ctx.accounts.platform_config;
    config.admin = ctx.accounts.admin.key();
    config.usdc_mint = usdc_mint;
    config.paused = false;
    config.version = PLATFORM_VERSION;
    config.bump = ctx.bumps.platform_config;

    Ok(())
}
