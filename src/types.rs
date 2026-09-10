extern crate alloc;

use alloc::{format, string::String, string::ToString, vec::Vec};
pub const KEY_ADMIN: &str = "admin";
pub const KEY_TREASURY: &str = "treasury";
pub const KEY_SIGNER: &str = "signer";
pub const KEY_PAUSER: &str = "pauser";
pub const KEY_PAUSED: &str = "paused";
pub const KEY_NONCES: &str = "nonces";
pub const KEY_CONSUMED: &str = "consumed_nonces";
pub const KEY_ROUTES: &str = "routes";
pub const KEY_ROUTE_IDS: &str = "route_ids";
pub const KEY_DOMAIN_SEPARATOR: &str = "domain_separator";
pub const KEY_CONTRACT_HASH: &str = "aifinpay_casper_v4_hash";
pub const KEY_CONTRACT_VERSION: &str = "aifinpay_casper_v4_version";

// ── Entry points ────────────────────────────────────────────────────────────
pub const EP_SETTLE_NATIVE: &str = "settle_native";
pub const EP_GRANT_SIGNER_ROLE: &str = "grant_signer_role";
pub const EP_REVOKE_SIGNER_ROLE: &str = "revoke_signer_role";
pub const EP_GRANT_PAUSER_ROLE: &str = "grant_pauser_role";
pub const EP_REVOKE_PAUSER_ROLE: &str = "revoke_pauser_role";
pub const EP_PAUSE: &str = "pause";
pub const EP_UNPAUSE: &str = "unpause";
pub const EP_CONFIGURE_ROUTE: &str = "configure_route";
pub const EP_DISABLE_ROUTE: &str = "disable_route";
pub const EP_ENABLE_ROUTE: &str = "enable_route";
pub const EP_GET_PROFILE: &str = "get_profile";
pub const EP_GET_ROUTE_IDS: &str = "get_route_ids";
pub const EP_GET_PAYER_NONCE: &str = "get_payer_nonce";
pub const EP_QUOTE_HASH: &str = "quote_hash";

// ── Arguments ───────────────────────────────────────────────────────────────
pub const ARG_MERCHANT: &str = "merchant";
pub const ARG_GROSS_AMOUNT: &str = "gross_amount";
pub const ARG_ROUTE: &str = "route";
pub const ARG_REQUEST_ID: &str = "request_id";
pub const ARG_VALID_UNTIL_MS: &str = "valid_until_ms";
pub const ARG_SIGNATURE: &str = "signature";
pub const ARG_SIGNER: &str = "signer";
pub const ARG_PAYER: &str = "payer";
pub const ARG_NONCE: &str = "nonce";
pub const ARG_TREASURY_BPS: &str = "treasury_bps";
pub const ARG_CREATOR_BPS: &str = "creator_bps";
pub const ARG_ENABLED: &str = "enabled";
pub const ARG_ROUTE_TREASURY: &str = "route_treasury";

pub const EXPIRY_MAX_AHEAD_MS: u64 = 20 * 60 * 1000;

// ── Error codes ─────────────────────────────────────────────────────────────
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
pub const ERR_ZERO_TREASURY: u16 = 115;
pub const ERR_INVALID_SIGNER: u16 = 116;
pub const ERR_INVALID_SIGNATURE: u16 = 117;
pub const ERR_INVALID_PAYER: u16 = 118;
pub const ERR_INVALID_NONCE: u16 = 119;
pub const ERR_NONCE_CONSUMED: u16 = 120;
pub const ERR_ROUTE_DISABLED: u16 = 121;
pub const ERR_UNKNOWN_ROUTE: u16 = 122;
pub const ERR_INCORRECT_AMOUNT: u16 = 123;
pub const ERR_ADMIN_EQUALS_SIGNER: u16 = 124;
pub const ERR_MISSING_IP_CREATOR: u16 = 125;
pub const ERR_FEE_TOO_HIGH: u16 = 126;
pub const ERR_CREATOR_FEE_TOO_HIGH: u16 = 127;

// ── BPS constants ───────────────────────────────────────────────────────────
pub const MAX_TREASURY_BPS: u16 = 500;
pub const MAX_IP_CREATOR_BPS: u16 = 100;
pub const BPS_DENOMINATOR: u16 = 10_000;

// ── Types ───────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SplitError {
    ZeroAmount,
    FeeRoundsToZero,
    InvalidRoute,
    FeeTooHigh,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RouteProfile {
    pub treasury_bps: u16,
    pub creator_bps: u16,
    pub enabled: bool,
    pub route_treasury: Option<String>,
}

impl RouteProfile {
    pub fn to_json(&self) -> String {
        match &self.route_treasury {
            Some(t) => format!(
                "{{\"treasury_bps\":{},\"creator_bps\":{},\"enabled\":{},\"route_treasury\":\"{}\"}}",
                self.treasury_bps, self.creator_bps, self.enabled, t
            ),
            None => format!(
                "{{\"treasury_bps\":{},\"creator_bps\":{},\"enabled\":{}}}",
                self.treasury_bps, self.creator_bps, self.enabled
            ),
        }
    }

    pub fn from_json(json: &str) -> Option<Self> {
        let treasury_bps = extract_json_u16(json, "treasury_bps")?;
        let creator_bps = extract_json_u16(json, "creator_bps")?;
        let enabled = extract_json_bool(json, "enabled")?;
        let route_treasury = extract_json_string(json, "route_treasury");
        Some(RouteProfile {
            treasury_bps,
            creator_bps,
            enabled,
            route_treasury,
        })
    }
}

fn extract_json_u16(json: &str, key: &str) -> Option<u16> {
    let needle = format!("\"{}\":", key);
    let start = json.find(&needle)? + needle.len();
    let slice = &json[start..];
    let end = slice.find([',', '}'])?;
    slice[..end].trim().parse().ok()
}

fn extract_json_bool(json: &str, key: &str) -> Option<bool> {
    let needle = format!("\"{}\":", key);
    let start = json.find(&needle)? + needle.len();
    let slice = &json[start..];
    let trimmed = slice.trim();
    if trimmed.starts_with("true") {
        Some(true)
    } else if trimmed.starts_with("false") {
        Some(false)
    } else {
        None
    }
}

fn extract_json_string(json: &str, key: &str) -> Option<String> {
    let needle = format!("\"{}\":\"", key);
    let start = json.find(&needle)? + needle.len();
    let slice = &json[start..];
    let end = slice.find('"')?;
    Some(slice[..end].to_string())
}

// ── Split ───────────────────────────────────────────────────────────────────

pub fn split_gross_bps(
    gross: u128,
    treasury_bps: u16,
    creator_bps: u16,
) -> Result<(u128, u128, u128), SplitError> {
    if gross == 0 {
        return Err(SplitError::ZeroAmount);
    }
    if treasury_bps > MAX_TREASURY_BPS {
        return Err(SplitError::FeeTooHigh);
    }
    if creator_bps > MAX_IP_CREATOR_BPS {
        return Err(SplitError::FeeTooHigh);
    }

    let treasury_amount = gross * (treasury_bps as u128) / (BPS_DENOMINATOR as u128);
    let creator_amount = gross * (creator_bps as u128) / (BPS_DENOMINATOR as u128);

    if treasury_bps > 0 && treasury_amount == 0 {
        return Err(SplitError::FeeRoundsToZero);
    }
    if creator_bps > 0 && creator_amount == 0 {
        return Err(SplitError::FeeRoundsToZero);
    }

    let merchant_amount = gross - treasury_amount - creator_amount;
    Ok((merchant_amount, treasury_amount, creator_amount))
}

// ── Quote hash ──────────────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
pub fn compute_quote_hash(
    domain_separator: &[u8],
    payer: &str,
    merchant: &str,
    gross_amount: u128,
    route: u8,
    request_id: &str,
    valid_until_ms: u64,
    nonce: u64,
) -> [u8; 32] {
    let mut data = Vec::new();
    data.extend_from_slice(domain_separator);
    data.extend_from_slice(payer.as_bytes());
    data.extend_from_slice(merchant.as_bytes());
    data.extend_from_slice(gross_amount.to_string().as_bytes());
    data.push(route);
    data.extend_from_slice(request_id.as_bytes());
    data.extend_from_slice(&valid_until_ms.to_le_bytes());
    data.extend_from_slice(&nonce.to_le_bytes());

    let mut hash = [0u8; 32];
    let mut state = [0u64; 8];
    for (i, chunk) in data.chunks(64).enumerate() {
        for (j, &byte) in chunk.iter().enumerate() {
            state[i % 8] ^= (byte as u64) << ((j % 8) * 8);
        }
    }
    for (i, &val) in state.iter().enumerate() {
        hash[i * 8..(i + 1) * 8].copy_from_slice(&val.to_le_bytes());
    }
    hash
}

pub fn verify_quote_hash(expected: &[u8; 32], actual: &[u8; 32]) -> bool {
    expected == actual
}

// ── Profile validation ──────────────────────────────────────────────────────

pub fn validate_profile(
    treasury_bps: u16,
    creator_bps: u16,
    enabled: bool,
    has_route_treasury: bool,
) -> Result<(), SplitError> {
    if !enabled {
        return Err(SplitError::InvalidRoute);
    }
    if treasury_bps > MAX_TREASURY_BPS {
        return Err(SplitError::FeeTooHigh);
    }
    if creator_bps > MAX_IP_CREATOR_BPS {
        return Err(SplitError::FeeTooHigh);
    }
    if treasury_bps > 0 && !has_route_treasury {
        return Err(SplitError::ZeroAmount);
    }
    Ok(())
}

// ── Storage key helpers ─────────────────────────────────────────────────────

pub fn nonce_key(account_hex: &str) -> String {
    format!("nonce_{}", account_hex)
}

pub fn consumed_key(account_hex: &str, nonce: u64) -> String {
    format!("consumed_{}_{}", account_hex, nonce)
}

pub fn route_storage_key(route: u8) -> String {
    format!("routes_{}", route)
}

// ── Role separation ─────────────────────────────────────────────────────────

pub fn check_role_separation(
    target: &str,
    admin: &str,
    signer: &str,
    pauser: &str,
    role: &str,
) -> Result<(), &'static str> {
    match role {
        "signer" => {
            if target == admin || target == pauser {
                return Err("admin_equals_signer");
            }
        }
        "admin" => {
            if target == signer || target == pauser {
                return Err("admin_equals_signer");
            }
        }
        "pauser" => {
            if target == signer {
                return Err("admin_equals_signer");
            }
        }
        _ => {}
    }
    Ok(())
}

// ── Hex ─────────────────────────────────────────────────────────────────────

pub fn hex_decode(hex: &str) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut i = 0;
    while i + 1 < hex.len() {
        let byte = u8::from_str_radix(&hex[i..i + 2], 16).unwrap_or(0);
        bytes.push(byte);
        i += 2;
    }
    bytes
}

pub fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::new();
    for &b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

#[cfg(test)]
mod tests {
    use alloc::vec;
    use super::*;

    // ── Split ───────────────────────────────────────────────────────────────

    #[test]
    fn split_99_1_0() {
        let (m, t, c) = split_gross_bps(10_000, 100, 0).unwrap();
        assert_eq!(m, 9_900);
        assert_eq!(t, 100);
        assert_eq!(c, 0);
        assert_eq!(m + t + c, 10_000);
    }

    #[test]
    fn split_100_0_0() {
        let (m, t, c) = split_gross_bps(1_000, 0, 0).unwrap();
        assert_eq!(m, 1_000);
        assert_eq!(t, 0);
        assert_eq!(c, 0);
    }

    #[test]
    fn split_3way_with_creator() {
        let (m, t, c) = split_gross_bps(100_000, 200, 50).unwrap();
        assert_eq!(t, 2_000);
        assert_eq!(c, 500);
        assert_eq!(m, 97_500);
        assert_eq!(m + t + c, 100_000);
    }

    #[test]
    fn split_zero_gross() {
        assert_eq!(split_gross_bps(0, 100, 0), Err(SplitError::ZeroAmount));
    }

    #[test]
    fn split_treasury_too_high() {
        assert_eq!(split_gross_bps(10_000, 501, 0), Err(SplitError::FeeTooHigh));
    }

    #[test]
    fn split_creator_too_high() {
        assert_eq!(split_gross_bps(10_000, 0, 101), Err(SplitError::FeeTooHigh));
    }

    #[test]
    fn split_treasury_rounds_to_zero() {
        assert_eq!(
            split_gross_bps(99, 100, 0),
            Err(SplitError::FeeRoundsToZero)
        );
    }

    #[test]
    fn split_creator_rounds_to_zero() {
        assert_eq!(
            split_gross_bps(99, 0, 100),
            Err(SplitError::FeeRoundsToZero)
        );
    }

    #[test]
    fn split_max_fees() {
        let (m, t, c) = split_gross_bps(1_000_000, 500, 100).unwrap();
        assert_eq!(t, 50_000);
        assert_eq!(c, 10_000);
        assert_eq!(m, 940_000);
        assert_eq!(m + t + c, 1_000_000);
    }

    #[test]
    fn split_preserves_sum() {
        for gross in [1u128, 100, 999, 10_000, 1_000_000, u128::MAX / 2] {
            let (m, t, c) = split_gross_bps(gross, 150, 30).unwrap();
            assert_eq!(m + t + c, gross, "sum mismatch for gross={}", gross);
        }
    }

    #[test]
    fn split_one_mote() {
        assert_eq!(split_gross_bps(1, 100, 0), Err(SplitError::FeeRoundsToZero));
    }

    #[test]
    fn split_exact_10000() {
        let (m, t, c) = split_gross_bps(10_000, 100, 50).unwrap();
        assert_eq!(t, 100);
        assert_eq!(c, 50);
        assert_eq!(m, 9_850);
    }

    // ── Quote hash ──────────────────────────────────────────────────────────

    #[test]
    fn hash_deterministic() {
        let h1 = compute_quote_hash(&[1, 2, 3], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        let h2 = compute_quote_hash(&[1, 2, 3], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        assert_eq!(h1, h2);
    }

    #[test]
    fn hash_different_payer() {
        let h1 = compute_quote_hash(&[], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        let h2 = compute_quote_hash(&[], "payer2", "merchant1", 1000, 1, "req1", 1000, 0);
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_different_merchant() {
        let h1 = compute_quote_hash(&[], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        let h2 = compute_quote_hash(&[], "payer1", "merchant2", 1000, 1, "req1", 1000, 0);
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_different_amount() {
        let h1 = compute_quote_hash(&[], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        let h2 = compute_quote_hash(&[], "payer1", "merchant1", 2000, 1, "req1", 1000, 0);
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_different_route() {
        let h1 = compute_quote_hash(&[], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        let h2 = compute_quote_hash(&[], "payer1", "merchant1", 1000, 2, "req1", 1000, 0);
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_different_request_id() {
        let h1 = compute_quote_hash(&[], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        let h2 = compute_quote_hash(&[], "payer1", "merchant1", 1000, 1, "req2", 1000, 0);
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_different_nonce() {
        let h1 = compute_quote_hash(&[], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        let h2 = compute_quote_hash(&[], "payer1", "merchant1", 1000, 1, "req1", 1000, 1);
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_different_domain() {
        let h1 = compute_quote_hash(&[1], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        let h2 = compute_quote_hash(&[2], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        assert_ne!(h1, h2);
    }

    #[test]
    fn hash_empty_domain() {
        let h = compute_quote_hash(&[], "payer1", "merchant1", 1000, 1, "req1", 1000, 0);
        assert_eq!(h.len(), 32);
    }

    #[test]
    fn verify_match() {
        let h = compute_quote_hash(&[], "p", "m", 100, 1, "r", 1000, 0);
        assert!(verify_quote_hash(&h, &h));
    }

    #[test]
    fn verify_mismatch() {
        let h1 = compute_quote_hash(&[], "p", "m", 100, 1, "r", 1000, 0);
        let h2 = compute_quote_hash(&[], "p", "m", 100, 1, "r", 1000, 1);
        assert!(!verify_quote_hash(&h1, &h2));
    }

    // ── RouteProfile JSON ───────────────────────────────────────────────────

    #[test]
    fn profile_json_round_trip_with_treasury() {
        let profile = RouteProfile {
            treasury_bps: 100,
            creator_bps: 50,
            enabled: true,
            route_treasury: Some("account-hash-abc123".to_string()),
        };
        let json = profile.to_json();
        let parsed = RouteProfile::from_json(&json).unwrap();
        assert_eq!(profile, parsed);
    }

    #[test]
    fn profile_json_round_trip_without_treasury() {
        let profile = RouteProfile {
            treasury_bps: 0,
            creator_bps: 0,
            enabled: true,
            route_treasury: None,
        };
        let json = profile.to_json();
        let parsed = RouteProfile::from_json(&json).unwrap();
        assert_eq!(profile, parsed);
    }

    #[test]
    fn profile_from_invalid_json() {
        assert!(RouteProfile::from_json("not json").is_none());
        assert!(RouteProfile::from_json("{}").is_none());
    }

    // ── validate_profile ────────────────────────────────────────────────────

    #[test]
    fn valid_profile() {
        assert!(validate_profile(100, 50, true, true).is_ok());
    }

    #[test]
    fn disabled_profile() {
        assert_eq!(
            validate_profile(100, 0, false, true),
            Err(SplitError::InvalidRoute)
        );
    }

    #[test]
    fn treasury_too_high_validate() {
        assert_eq!(
            validate_profile(501, 0, true, true),
            Err(SplitError::FeeTooHigh)
        );
    }

    #[test]
    fn treasury_bps_nonzero_no_treasury() {
        assert_eq!(
            validate_profile(100, 0, true, false),
            Err(SplitError::ZeroAmount)
        );
    }

    // ── Storage key helpers ─────────────────────────────────────────────────

    #[test]
    fn nonce_key_format() {
        assert_eq!(nonce_key("abc123"), "nonce_abc123");
    }

    #[test]
    fn consumed_key_format() {
        assert_eq!(consumed_key("abc123", 42), "consumed_abc123_42");
    }

    #[test]
    fn route_storage_key_format() {
        assert_eq!(route_storage_key(1), "routes_1");
        assert_eq!(route_storage_key(255), "routes_255");
    }

    // ── Role separation ─────────────────────────────────────────────────────

    #[test]
    fn role_separation_signer_vs_admin() {
        assert!(check_role_separation("alice", "alice", "bob", "carol", "signer").is_err());
    }

    #[test]
    fn role_separation_signer_vs_pauser() {
        assert!(check_role_separation("carol", "alice", "bob", "carol", "signer").is_err());
    }

    #[test]
    fn role_separation_admin_vs_signer() {
        assert!(check_role_separation("bob", "alice", "bob", "carol", "admin").is_err());
    }

    #[test]
    fn role_separation_admin_vs_pauser() {
        assert!(check_role_separation("carol", "alice", "bob", "carol", "admin").is_err());
    }

    #[test]
    fn role_separation_pauser_vs_signer() {
        assert!(check_role_separation("bob", "alice", "bob", "carol", "pauser").is_err());
    }

    #[test]
    fn role_separation_valid() {
        assert!(check_role_separation("dave", "alice", "bob", "carol", "signer").is_ok());
        assert!(check_role_separation("dave", "alice", "bob", "carol", "admin").is_ok());
        assert!(check_role_separation("dave", "alice", "bob", "carol", "pauser").is_ok());
    }

    // ── Hex ─────────────────────────────────────────────────────────────────

    #[test]
    fn hex_round_trip() {
        let bytes = vec![0u8, 1, 127, 128, 255];
        let hex = hex_encode(&bytes);
        let decoded = hex_decode(&hex);
        assert_eq!(bytes, decoded);
    }

    #[test]
    fn hex_encode_known() {
        assert_eq!(hex_encode(&[0xab, 0xcd]), "abcd");
        assert_eq!(hex_encode(&[0xff]), "ff");
        assert_eq!(hex_encode(&[]), "");
    }

    #[test]
    fn hex_decode_known() {
        assert_eq!(hex_decode("abcd"), vec![0xab, 0xcd]);
        assert_eq!(hex_decode("ff"), vec![0xff]);
        assert_eq!(hex_decode(""), vec![]);
    }
}
