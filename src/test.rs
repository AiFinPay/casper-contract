#[cfg(test)]
mod tests {
    use crate::types::*;
    use alloc::vec;

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
        for gross in [999u128, 10_000, 1_000_000, u64::MAX as u128] {
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

    // ── Payment flow: end-to-end split scenarios ────────────────────────────

    #[test]
    fn payment_standard_commerce_100_cspr() {
        let gross = 100_000_000_000u128; // 100 CSPR in motes
        let (merchant, treasury, creator) = split_gross_bps(gross, 100, 50).unwrap();
        assert_eq!(treasury, 1_000_000_000); // 1% = 1 CSPR
        assert_eq!(creator, 500_000_000); // 0.5% = 0.5 CSPR
        assert_eq!(merchant, 98_500_000_000); // 98.5% = 98.5 CSPR
        assert_eq!(merchant + treasury + creator, gross);
    }

    #[test]
    fn payment_zero_fee_route() {
        let gross = 50_000_000_000u128;
        let (merchant, treasury, creator) = split_gross_bps(gross, 0, 0).unwrap();
        assert_eq!(merchant, gross);
        assert_eq!(treasury, 0);
        assert_eq!(creator, 0);
    }

    #[test]
    fn payment_max_fees() {
        let gross = 1_000_000_000_000u128; // 1000 CSPR
        let (merchant, treasury, creator) = split_gross_bps(gross, 500, 100).unwrap();
        assert_eq!(treasury, 50_000_000_000); // 5% = 50 CSPR
        assert_eq!(creator, 10_000_000_000); // 1% = 10 CSPR
        assert_eq!(merchant, 940_000_000_000); // 94% = 940 CSPR
        assert_eq!(merchant + treasury + creator, gross);
    }

    #[test]
    fn payment_minimum_viable_amount() {
        let gross = 10_000u128;
        let (merchant, treasury, creator) = split_gross_bps(gross, 100, 0).unwrap();
        assert_eq!(treasury, 100);
        assert_eq!(creator, 0);
        assert_eq!(merchant, 9_900);
        assert_eq!(merchant + treasury + creator, gross);
    }

    #[test]
    fn payment_treasury_rounds_to_zero_rejects() {
        let gross = 99u128; // too small for 1% fee
        assert_eq!(
            split_gross_bps(gross, 100, 0),
            Err(SplitError::FeeRoundsToZero)
        );
    }

    #[test]
    fn payment_creator_rounds_to_zero_rejects() {
        let gross = 99u128;
        assert_eq!(
            split_gross_bps(gross, 0, 100),
            Err(SplitError::FeeRoundsToZero)
        );
    }

    // ── Payment flow: quote hash end-to-end ─────────────────────────────────

    #[test]
    fn quote_hash_full_payment_flow() {
        let domain = b"aifinpay-casper-v4";
        let payer = "account-hash-aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
        let merchant =
            "account-hash-1122334455667788112233445566778811223344556677881122334455667788";
        let gross = 100_000_000_000u128; // 100 CSPR
        let route = 1u8;
        let request_id = "order-20240101-001";
        let valid_until_ms = 1735689600000u64; // 2025-01-01
        let nonce = 0u64;

        let h1 = compute_quote_hash(
            domain,
            payer,
            merchant,
            gross,
            route,
            request_id,
            valid_until_ms,
            nonce,
        );
        let h2 = compute_quote_hash(
            domain,
            payer,
            merchant,
            gross,
            route,
            request_id,
            valid_until_ms,
            nonce,
        );
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 32);
    }

    #[test]
    fn quote_hash_tamper_detection() {
        let domain = b"aifinpay-casper-v4";
        let payer = "account-hash-aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233";
        let merchant =
            "account-hash-1122334455667788112233445566778811223344556677881122334455667788";
        let gross = 100_000_000_000u128;
        let route = 1u8;
        let request_id = "order-20240101-001";
        let valid_until_ms = 1735689600000u64;
        let nonce = 0u64;

        let original = compute_quote_hash(
            domain,
            payer,
            merchant,
            gross,
            route,
            request_id,
            valid_until_ms,
            nonce,
        );

        // tamper with amount
        let tampered = compute_quote_hash(
            domain,
            payer,
            merchant,
            gross + 1,
            route,
            request_id,
            valid_until_ms,
            nonce,
        );
        assert_ne!(original, tampered);

        // tamper with nonce
        let tampered = compute_quote_hash(
            domain,
            payer,
            merchant,
            gross,
            route,
            request_id,
            valid_until_ms,
            nonce + 1,
        );
        assert_ne!(original, tampered);

        // tamper with payer
        let tampered = compute_quote_hash(
            domain,
            "account-hash-0000000000000000000000000000000000000000000000000000000000000000",
            merchant,
            gross,
            route,
            request_id,
            valid_until_ms,
            nonce,
        );
        assert_ne!(original, tampered);

        // tamper with domain
        let tampered = compute_quote_hash(
            b"wrong-domain",
            payer,
            merchant,
            gross,
            route,
            request_id,
            valid_until_ms,
            nonce,
        );
        assert_ne!(original, tampered);
    }

    // ── Payment flow: profile lifecycle ─────────────────────────────────────

    #[test]
    fn profile_lifecycle_configure_disable_enable() {
        let profile = RouteProfile {
            treasury_bps: 100,
            creator_bps: 50,
            enabled: true,
            route_treasury: Some(
                "account-hash-treasury00000000000000000000000000000000000000000000000000"
                    .to_string(),
            ),
        };

        // configure: valid
        assert!(validate_profile(
            profile.treasury_bps,
            profile.creator_bps,
            profile.enabled,
            profile.route_treasury.is_some()
        )
        .is_ok());

        // disable
        let mut disabled = profile.clone();
        disabled.enabled = false;
        assert_eq!(
            validate_profile(
                disabled.treasury_bps,
                disabled.creator_bps,
                disabled.enabled,
                disabled.route_treasury.is_some()
            ),
            Err(SplitError::InvalidRoute)
        );

        // re-enable
        let re_enabled = RouteProfile {
            enabled: true,
            ..disabled
        };
        assert!(validate_profile(
            re_enabled.treasury_bps,
            re_enabled.creator_bps,
            re_enabled.enabled,
            re_enabled.route_treasury.is_some()
        )
        .is_ok());
    }

    #[test]
    fn profile_json_round_trip_full() {
        let profile = RouteProfile {
            treasury_bps: 250,
            creator_bps: 75,
            enabled: true,
            route_treasury: Some(
                "account-hash-tttt000000000000000000000000000000000000000000000000000000"
                    .to_string(),
            ),
        };
        let json = profile.to_json();
        assert!(json.contains("\"treasury_bps\":250"));
        assert!(json.contains("\"creator_bps\":75"));
        assert!(json.contains("\"enabled\":true"));
        assert!(json.contains("\"route_treasury\":\"account-hash-tttt"));

        let parsed = RouteProfile::from_json(&json).unwrap();
        assert_eq!(parsed.treasury_bps, 250);
        assert_eq!(parsed.creator_bps, 75);
        assert!(parsed.enabled);
        assert_eq!(parsed.route_treasury, profile.route_treasury);
    }

    // ── Payment flow: role separation edge cases ────────────────────────────

    #[test]
    fn role_separation_all_distinct() {
        assert!(check_role_separation("payer1", "admin1", "signer1", "pauser1", "signer").is_ok());
        assert!(check_role_separation("payer1", "admin1", "signer1", "pauser1", "admin").is_ok());
        assert!(check_role_separation("payer1", "admin1", "signer1", "pauser1", "pauser").is_ok());
    }

    #[test]
    fn role_separation_self_assignment_rejected() {
        // signer cannot be admin
        assert!(check_role_separation("admin1", "admin1", "signer1", "pauser1", "signer").is_err());
        // signer cannot be pauser
        assert!(
            check_role_separation("pauser1", "admin1", "signer1", "pauser1", "signer").is_err()
        );
        // admin cannot be signer
        assert!(check_role_separation("signer1", "admin1", "signer1", "pauser1", "admin").is_err());
        // admin cannot be pauser
        assert!(check_role_separation("pauser1", "admin1", "signer1", "pauser1", "admin").is_err());
        // pauser cannot be signer
        assert!(
            check_role_separation("signer1", "admin1", "signer1", "pauser1", "pauser").is_err()
        );
    }

    // ── Payment flow: nonce management helpers ──────────────────────────────

    #[test]
    fn nonce_key_uniqueness() {
        let k1 = nonce_key("aa11bb22");
        let k2 = nonce_key("cc33dd44");
        assert_ne!(k1, k2);
        assert!(k1.starts_with("nonce_"));
        assert!(k2.starts_with("nonce_"));
    }

    #[test]
    fn consumed_key_uniqueness() {
        let k1 = consumed_key("aa11bb22", 0);
        let k2 = consumed_key("aa11bb22", 1);
        let k3 = consumed_key("cc33dd44", 0);
        assert_ne!(k1, k2); // same account, different nonce
        assert_ne!(k1, k3); // different account, same nonce
        assert!(k1.starts_with("consumed_"));
    }

    #[test]
    fn route_storage_key_uniqueness() {
        let k1 = route_storage_key(1);
        let k2 = route_storage_key(2);
        assert_ne!(k1, k2);
        assert!(k1.starts_with("routes_"));
    }

    // ── Payment flow: error code coverage ───────────────────────────────────

    #[test]
    fn error_codes_are_unique() {
        let codes = [
            ERR_MISSING_KEY,
            ERR_ALREADY_SETTLED,
            ERR_UNAUTHORIZED,
            ERR_INVALID_WALLET,
            ERR_INVALID_IDENTIFIER,
            ERR_INVALID_AMOUNT,
            ERR_SELF_PAYMENT,
            ERR_TRANSFER_FAILED,
            ERR_OVERFLOW,
            ERR_INVALID_ROUTE,
            ERR_PAUSED,
            ERR_EXPIRED,
            ERR_EXPIRY_TOO_FAR,
            ERR_FEE_ROUNDS_TO_ZERO,
            ERR_ZERO_TREASURY,
            ERR_INVALID_SIGNER,
            ERR_INVALID_SIGNATURE,
            ERR_INVALID_PAYER,
            ERR_INVALID_NONCE,
            ERR_NONCE_CONSUMED,
            ERR_ROUTE_DISABLED,
            ERR_UNKNOWN_ROUTE,
            ERR_INCORRECT_AMOUNT,
            ERR_ADMIN_EQUALS_SIGNER,
            ERR_MISSING_IP_CREATOR,
            ERR_FEE_TOO_HIGH,
            ERR_CREATOR_FEE_TOO_HIGH,
        ];
        let mut sorted = codes.to_vec();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), codes.len(), "duplicate error codes found");
    }

    #[test]
    fn bps_constants_consistent() {
        assert!(MAX_TREASURY_BPS <= BPS_DENOMINATOR);
        assert!(MAX_IP_CREATOR_BPS <= BPS_DENOMINATOR);
        assert!(MAX_TREASURY_BPS + MAX_IP_CREATOR_BPS <= BPS_DENOMINATOR);
    }
}
