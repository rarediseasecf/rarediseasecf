pub mod approve_campaign;
pub mod confirm_fulfillment;
pub mod create_campaign;
pub mod donate_usdc;
pub mod initialize_platform;
pub mod manage_provider;
pub mod manage_verifier;
pub mod release_expired_funds;
pub mod release_provider_payment;
pub mod settle_milestone;

// Re-export Accounts + Anchor-generated __client_accounts_* modules for #[program].
pub use approve_campaign::*;
pub use confirm_fulfillment::*;
pub use create_campaign::*;
pub use donate_usdc::*;
pub use initialize_platform::*;
pub use manage_provider::*;
pub use manage_verifier::*;
pub use release_expired_funds::*;
pub use release_provider_payment::*;
pub use settle_milestone::*;
