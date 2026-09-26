use anchor_lang::prelude::*;

use crate::CAMPAIGN_ID_MAX_LEN;

/// Campaign lifecycle. Funding uses `amount_raised` while status is Approved.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CampaignStatus {
    Draft,
    Approved,
    /// Provider confirmed fulfillment; eligible for settlement.
    Fulfilled,
    /// Exact target paid to immutable provider wallet.
    Settled,
}

#[account]
#[derive(InitSpace)]
pub struct PlatformConfig {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub paused: bool,
    pub version: u8,
    pub bump: u8,
}

impl PlatformConfig {
    pub const SEED: &'static [u8] = b"platform-config";
    /// 8-byte discriminator + InitSpace fields.
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct VerifierRegistry {
    pub verifier_wallet: Pubkey,
    pub active: bool,
    pub bump: u8,
}

impl VerifierRegistry {
    pub const SEED: &'static [u8] = b"verifier";
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

#[account]
#[derive(InitSpace)]
pub struct ProviderRegistry {
    pub provider_wallet: Pubkey,
    pub active: bool,
    pub bump: u8,
}

impl ProviderRegistry {
    pub const SEED: &'static [u8] = b"provider";
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

/// Campaign account (opaque ID only — no PHI).
///
/// `campaign_id` is a bounded Anchor string: 4-byte length prefix + at most
/// [`CAMPAIGN_ID_MAX_LEN`] (16) UTF-8 bytes (opaque `RD-*` identifiers).
#[account]
#[derive(InitSpace)]
pub struct Campaign {
    #[max_len(CAMPAIGN_ID_MAX_LEN)]
    pub campaign_id: String,
    pub status: CampaignStatus,
    pub verifier_wallet: Pubkey,
    /// Immutable provider payout wallet after create/approve.
    pub provider_wallet: Pubkey,
    pub usdc_mint: Pubkey,
    /// Final verified funding gap in USDC base units (6 decimals).
    pub verified_funding_gap: u64,
    /// Raised via `donate_usdc`; never exceeds `verified_funding_gap`.
    pub amount_raised: u64,
    pub expires_at: i64,
    pub approved_at: i64,
    pub fulfilled_at: i64,
    pub settled_at: i64,
    /// Set only on successful settlement; equals sum of released tranches (≤ gap).
    pub settled_amount: u64,
    /// Bitmask of settled milestone percents: bit0=25, bit1=50, bit2=75, bit3=100.
    pub milestone_settled_mask: u8,
    pub bump: u8,
    pub vault_bump: u8,
    pub version: u8,
}

impl Campaign {
    pub const SEED: &'static [u8] = b"campaign";
    pub const VAULT_SEED: &'static [u8] = b"vault";
    pub const SPACE: usize = 8 + Self::INIT_SPACE;
}

/// Validate opaque campaign ID: non-empty, ≤16 bytes, A-Z/0-9/- only (e.g. `K7MQP`, `RD-8F29KQ`).
pub fn validate_campaign_id(campaign_id: &str) -> Result<()> {
    require!(
        !campaign_id.is_empty() && campaign_id.len() <= CAMPAIGN_ID_MAX_LEN,
        crate::errors::RareDiseaseError::InvalidCampaignId
    );
    require!(
        campaign_id
            .chars()
            .all(|c| matches!(c, 'A'..='Z' | '0'..='9' | '-')),
        crate::errors::RareDiseaseError::InvalidCampaignId
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_canonical_opaque_id() {
        assert!(validate_campaign_id("RD-8F29KQ").is_ok());
        assert!(validate_campaign_id("K7MQP").is_ok());
    }

    #[test]
    fn rejects_empty() {
        assert!(validate_campaign_id("").is_err());
    }

    #[test]
    fn rejects_lowercase_and_symbols() {
        assert!(validate_campaign_id("rd-8F29KQ").is_err());
        assert!(validate_campaign_id("RD-8F29_KQ").is_err());
    }

    #[test]
    fn rejects_overlong() {
        assert!(validate_campaign_id("RD-ABCDEFGHIJKLM").is_err()); // 16 ok boundary check via len
        let too_long = "RD-ABCDEFGHIJKLMN"; // 17
        assert!(too_long.len() > CAMPAIGN_ID_MAX_LEN);
        assert!(validate_campaign_id(too_long).is_err());
    }
}
