//! Milestone percent helpers (25/50/75/100) — no PHI.
use anchor_lang::prelude::*;

use crate::errors::RareDiseaseError;

/// Bit index for each milestone percent (settled mask).
pub fn milestone_bit(percent: u8) -> Result<u8> {
    match percent {
        25 => Ok(0),
        50 => Ok(1),
        75 => Ok(2),
        100 => Ok(3),
        _ => Err(error!(RareDiseaseError::InvalidMilestonePercent)),
    }
}

pub fn is_milestone_settled(mask: u8, percent: u8) -> Result<bool> {
    let bit = milestone_bit(percent)?;
    Ok((mask & (1u8 << bit)) != 0)
}

pub fn with_milestone_settled(mask: u8, percent: u8) -> Result<u8> {
    let bit = milestone_bit(percent)?;
    Ok(mask | (1u8 << bit))
}

/// Previous rung percent (0 before 25%).
pub fn previous_percent(percent: u8) -> Result<u8> {
    match percent {
        25 => Ok(0),
        50 => Ok(25),
        75 => Ok(50),
        100 => Ok(75),
        _ => Err(error!(RareDiseaseError::InvalidMilestonePercent)),
    }
}

/// Tranche size in USDC base units for a percent rung.
pub fn tranche_amount(verified_funding_gap: u64, percent: u8) -> Result<u64> {
    let prev = previous_percent(percent)?;
    let current = verified_funding_gap
        .checked_mul(percent as u64)
        .and_then(|v| v.checked_div(100))
        .ok_or_else(|| error!(RareDiseaseError::InvalidFundingGap))?;
    let previous = if prev == 0 {
        0u64
    } else {
        verified_funding_gap
            .checked_mul(prev as u64)
            .and_then(|v| v.checked_div(100))
            .ok_or_else(|| error!(RareDiseaseError::InvalidFundingGap))?
    };
    current
        .checked_sub(previous)
        .ok_or_else(|| error!(RareDiseaseError::InvalidFundingGap))
}

/// Threshold raised amount required before a rung may settle.
pub fn threshold_amount(verified_funding_gap: u64, percent: u8) -> Result<u64> {
    require!(
        matches!(percent, 25 | 50 | 75 | 100),
        RareDiseaseError::InvalidMilestonePercent
    );
    verified_funding_gap
        .checked_mul(percent as u64)
        .and_then(|v| v.checked_div(100))
        .ok_or_else(|| error!(RareDiseaseError::InvalidFundingGap))
}

pub fn all_milestones_settled(mask: u8) -> bool {
    // bits 0..3
    mask & 0b1111 == 0b1111
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tranche_quarters_equal_gap() {
        let gap = 1_000_000_000u64;
        assert_eq!(tranche_amount(gap, 25).unwrap(), 250_000_000);
        assert_eq!(tranche_amount(gap, 50).unwrap(), 250_000_000);
        assert_eq!(tranche_amount(gap, 75).unwrap(), 250_000_000);
        assert_eq!(tranche_amount(gap, 100).unwrap(), 250_000_000);
        let sum = [25, 50, 75, 100]
            .iter()
            .map(|p| tranche_amount(gap, *p).unwrap())
            .sum::<u64>();
        assert_eq!(sum, gap);
    }

    #[test]
    fn mask_bits_do_not_double() {
        let mut mask = 0u8;
        mask = with_milestone_settled(mask, 25).unwrap();
        assert!(is_milestone_settled(mask, 25).unwrap());
        assert!(!is_milestone_settled(mask, 50).unwrap());
        mask = with_milestone_settled(mask, 50).unwrap();
        assert!(all_milestones_settled(0b1111));
        assert!(!all_milestones_settled(mask));
    }

    #[test]
    fn rejects_bad_percent() {
        assert!(milestone_bit(30).is_err());
        assert!(tranche_amount(100, 10).is_err());
    }
}
