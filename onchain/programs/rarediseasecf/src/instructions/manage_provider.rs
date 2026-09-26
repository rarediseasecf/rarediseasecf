use anchor_lang::prelude::*;

use crate::errors::RareDiseaseError;
use crate::state::{PlatformConfig, ProviderRegistry};

#[derive(Accounts)]
#[instruction(provider_wallet: Pubkey)]
pub struct UpsertProvider<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PlatformConfig::SEED],
        bump = platform_config.bump,
        has_one = admin @ RareDiseaseError::UnauthorizedAdmin
    )]
    pub platform_config: Account<'info, PlatformConfig>,

    #[account(
        init_if_needed,
        payer = admin,
        space = ProviderRegistry::SPACE,
        seeds = [ProviderRegistry::SEED, provider_wallet.as_ref()],
        bump
    )]
    pub provider_registry: Account<'info, ProviderRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn upsert_provider_handler(
    ctx: Context<UpsertProvider>,
    provider_wallet: Pubkey,
    active: bool,
) -> Result<()> {
    require!(
        provider_wallet != Pubkey::default(),
        RareDiseaseError::InvalidProvider
    );

    let registry = &mut ctx.accounts.provider_registry;
    registry.provider_wallet = provider_wallet;
    registry.active = active;
    registry.bump = ctx.bumps.provider_registry;

    Ok(())
}
