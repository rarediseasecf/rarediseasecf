use anchor_lang::prelude::*;

use crate::errors::RareDiseaseError;
use crate::state::{PlatformConfig, VerifierRegistry};

#[derive(Accounts)]
#[instruction(verifier_wallet: Pubkey)]
pub struct UpsertVerifier<'info> {
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
        space = VerifierRegistry::SPACE,
        seeds = [VerifierRegistry::SEED, verifier_wallet.as_ref()],
        bump
    )]
    pub verifier_registry: Account<'info, VerifierRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn upsert_verifier_handler(
    ctx: Context<UpsertVerifier>,
    verifier_wallet: Pubkey,
    active: bool,
) -> Result<()> {
    require!(
        verifier_wallet != Pubkey::default(),
        RareDiseaseError::InvalidVerifier
    );

    let registry = &mut ctx.accounts.verifier_registry;
    // Seeds already bind this PDA to verifier_wallet.
    registry.verifier_wallet = verifier_wallet;
    registry.active = active;
    registry.bump = ctx.bumps.verifier_registry;

    Ok(())
}
