use anchor_lang::prelude::*;

#[error_code]
pub enum RareDiseaseError {
    #[msg("Platform configuration already initialized")]
    PlatformAlreadyInitialized,
    #[msg("Caller is not the platform administrator")]
    UnauthorizedAdmin,
    #[msg("Platform is paused")]
    PlatformPaused,
    #[msg("USDC mint is invalid")]
    InvalidUsdcMint,
    #[msg("Verifier wallet is invalid")]
    InvalidVerifier,
    #[msg("Verifier is inactive")]
    VerifierInactive,
    #[msg("Provider wallet is invalid")]
    InvalidProvider,
    #[msg("Provider is inactive")]
    ProviderInactive,
    #[msg("Campaign ID is invalid")]
    InvalidCampaignId,
    #[msg("Campaign already exists")]
    CampaignAlreadyExists,
    #[msg("Campaign not found")]
    CampaignNotFound,
    #[msg("Verified funding gap must be greater than zero")]
    InvalidFundingGap,
    #[msg("Campaign expiry is invalid")]
    InvalidExpiry,
    #[msg("Campaign has expired")]
    CampaignExpired,
    #[msg("Campaign is in an invalid state for this action")]
    InvalidCampaignState,
    #[msg("Caller is not the campaign verifier")]
    UnauthorizedVerifier,
    #[msg("Campaign is already approved")]
    CampaignAlreadyApproved,
    #[msg("Amount raised must be zero for this action")]
    UnexpectedAmountRaised,
    #[msg("Donation amount must be greater than zero")]
    InvalidDonationAmount,
    #[msg("Donation would exceed the verified funding gap")]
    OverfundingNotAllowed,
    #[msg("Campaign is not fully funded")]
    CampaignNotFullyFunded,
    #[msg("Caller is not the registered campaign provider")]
    UnauthorizedProvider,
    #[msg("Fulfillment has not been confirmed")]
    FulfillmentNotConfirmed,
    #[msg("Campaign is already settled")]
    CampaignAlreadySettled,
    #[msg("Provider destination token account is invalid")]
    InvalidProviderDestination,
    #[msg("Vault balance is insufficient for settlement")]
    InsufficientVaultBalance,
    #[msg("Settlement amount mismatch")]
    SettlementAmountMismatch,
    #[msg("Milestone percent must be 25, 50, 75, or 100")]
    InvalidMilestonePercent,
    #[msg("Milestone already settled on-chain")]
    MilestoneAlreadySettled,
    #[msg("Raised amount has not reached this milestone threshold")]
    MilestoneNotEligible,
    #[msg("Settling this milestone would exceed raised funds or funding target")]
    MilestoneOverSettle,
    #[msg("Use settle_milestone when tranche settles have started")]
    UseSettleMilestone,
    #[msg("Campaign has not expired yet")]
    CampaignNotExpired,
    #[msg("Vault is empty; nothing to release")]
    NothingToRelease,
}
