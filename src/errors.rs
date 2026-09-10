use casper_types::U512;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SplitError {
    ZeroAmount,
    FeeRoundsToZero,
    InvalidRoute,
}

// ── Error codes (stable for SDK/E2E assertions) ──────────────────────────────
pub const ERR_MISSING_KEY: u16 = 1;
pub const ERR_ALREADY_SETTLED: u16 = 102;
pub const ERR_UNAUTHORIZED: u16 = 103;
pub const ERR_INVALID_WALLET: u16 = 104;
pub const ERR_INVALID_IDENTIFIER: u16 = 105;
pub const ERR_INVALID_AMOUNT: u16 = 106;
pub const ERR_SELF_PAYMENT: u16 = 107;
pub const ERR_TRANSFER_FAILED: u16 = 108;
pub const ERR_OVERFLOW: u16 = 109;
pub const ERR_INVALID_ROUTE: u16 = 110;
pub const ERR_PAUSED: u16 = 111;
pub const ERR_EXPIRED: u16 = 112;
pub const ERR_EXPIRY_TOO_FAR: u16 = 113;
pub const ERR_FEE_ROUNDS_TO_ZERO: u16 = 114;

/// Canonical immutable product economics shared by the v3 contract and host tests.
/// AIFP-1: merchant 99%, treasury 1%, creator 0%, all from the gross payer amount.
/// AIFP-2: merchant/provider 100%, treasury 0%, creator 0%.
pub fn split_gross(route: u8, gross: U512) -> Result<(U512, U512), SplitError> {
    if gross.is_zero() {
        return Err(SplitError::ZeroAmount);
    }
    match route {
        ROUTE_AIFP1 => {
            let treasury = gross / U512::from(100u64);
            if treasury.is_zero() {
                return Err(SplitError::FeeRoundsToZero);
            }
            Ok((gross - treasury, treasury))
        }
        ROUTE_AIFP2 => Ok((gross, U512::zero())),
        _ => Err(SplitError::InvalidRoute),
    }
}

pub const ROUTE_AIFP1: u8 = 1;
pub const ROUTE_AIFP2: u8 = 2;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aifp1_is_exactly_gross_inclusive_99_1_0() {
        let (merchant, treasury) = split_gross(ROUTE_AIFP1, U512::from(10_000u64)).unwrap();
        assert_eq!(merchant, U512::from(9_900u64));
        assert_eq!(treasury, U512::from(100u64));
        assert_eq!(merchant + treasury, U512::from(10_000u64));
    }

    #[test]
    fn aifp2_is_exactly_zero_percent() {
        let (provider, treasury) = split_gross(ROUTE_AIFP2, U512::from(1u64)).unwrap();
        assert_eq!(provider, U512::from(1u64));
        assert_eq!(treasury, U512::zero());
    }

    #[test]
    fn aifp1_rejects_when_one_percent_rounds_to_zero() {
        assert_eq!(
            split_gross(ROUTE_AIFP1, U512::from(99u64)),
            Err(SplitError::FeeRoundsToZero)
        );
        assert_eq!(
            split_gross(ROUTE_AIFP1, U512::from(100u64)).unwrap(),
            (U512::from(99u64), U512::from(1u64))
        );
    }

    #[test]
    fn zero_and_unknown_routes_fail_closed() {
        assert_eq!(
            split_gross(ROUTE_AIFP1, U512::zero()),
            Err(SplitError::ZeroAmount)
        );
        assert_eq!(
            split_gross(3, U512::from(100u64)),
            Err(SplitError::InvalidRoute)
        );
    }
}
