use alloc::{
    string::{String, ToString},
    vec::Vec,
};
use casper_contract::{
    contract_api::{runtime, storage, system},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{api_error::ApiError, CLValue, U512};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use crate::{
    storage::{checked_increment, read_bool, read_string, read_u64, write_bool, write_u64},
    types::{
        self, RouteProfile, ARG_CREATOR_BPS, ARG_ENABLED, ARG_GROSS_AMOUNT, ARG_MERCHANT,
        ARG_NONCE, ARG_PAYER, ARG_REQUEST_ID, ARG_ROUTE, ARG_ROUTE_TREASURY, ARG_SIGNATURE,
        ARG_SIGNER, ARG_TREASURY_BPS, ARG_VALID_UNTIL_MS, ERR_ADMIN_EQUALS_SIGNER,
        ERR_CREATOR_FEE_TOO_HIGH, ERR_FEE_ROUNDS_TO_ZERO, ERR_FEE_TOO_HIGH, ERR_INVALID_AMOUNT,
        ERR_INVALID_NONCE, ERR_INVALID_PAYER, ERR_INVALID_SIGNATURE, ERR_NONCE_CONSUMED,
        ERR_PAUSED, ERR_ROUTE_DISABLED, ERR_SELF_PAYMENT, ERR_TRANSFER_FAILED, ERR_UNAUTHORIZED,
        ERR_UNKNOWN_ROUTE, ERR_ZERO_TREASURY, KEY_ADMIN, KEY_DOMAIN_SEPARATOR, KEY_PAUSED,
        KEY_PAUSER, KEY_SIGNER, KEY_TREASURY, MAX_IP_CREATOR_BPS, MAX_TREASURY_BPS,
    },
    validation::{parse_account, require_identifier, validate_expiry},
};

// ── Route Profile Storage ───────────────────────────────────────────────────

fn store_profile(route: u8, profile: &RouteProfile) {
    let key = types::route_storage_key(route);
    let uref = storage::new_uref(profile.to_json());
    runtime::put_key(&key, casper_types::Key::URef(uref));
}

fn read_profile(route: u8) -> Option<RouteProfile> {
    let key = types::route_storage_key(route);
    match runtime::get_key(&key) {
        Some(casper_types::Key::URef(uref)) => {
            let json: String = storage::read::<String>(uref)
                .unwrap_or_revert()
                .unwrap_or_default();
            RouteProfile::from_json(&json)
        }
        _ => None,
    }
}

fn require_valid_profile(route: u8) -> RouteProfile {
    let profile = read_profile(route).unwrap_or_revert_with(ApiError::User(ERR_UNKNOWN_ROUTE));
    if !profile.enabled {
        runtime::revert(ApiError::User(ERR_ROUTE_DISABLED));
    }
    if profile.treasury_bps > MAX_TREASURY_BPS {
        runtime::revert(ApiError::User(ERR_FEE_TOO_HIGH));
    }
    if profile.creator_bps > MAX_IP_CREATOR_BPS {
        runtime::revert(ApiError::User(ERR_CREATOR_FEE_TOO_HIGH));
    }
    if profile.treasury_bps > 0 && profile.route_treasury.is_none() {
        runtime::revert(ApiError::User(ERR_ZERO_TREASURY));
    }
    profile
}

fn resolve_treasury(profile: &RouteProfile) -> String {
    profile
        .route_treasury
        .clone()
        .unwrap_or_else(|| read_string(KEY_TREASURY))
}

// ── Nonce Management ────────────────────────────────────────────────────────

fn nonce_key(account: &casper_types::account::AccountHash) -> String {
    types::nonce_key(&account.to_formatted_string().replace("account-hash-", ""))
}

fn consumed_key(account: &casper_types::account::AccountHash, nonce: u64) -> String {
    types::consumed_key(
        &account.to_formatted_string().replace("account-hash-", ""),
        nonce,
    )
}

fn get_payer_nonce(account: &casper_types::account::AccountHash) -> u64 {
    let key = nonce_key(account);
    read_u64(&key)
}

fn increment_nonce(account: &casper_types::account::AccountHash) {
    let current = get_payer_nonce(account);
    let next = checked_increment(current);
    let key = nonce_key(account);
    write_u64(&key, next);
}

fn mark_nonce_consumed(account: &casper_types::account::AccountHash, nonce: u64) {
    let key = consumed_key(account, nonce);
    let uref = storage::new_uref(true);
    runtime::put_key(&key, casper_types::Key::URef(uref));
}

fn is_nonce_consumed(account: &casper_types::account::AccountHash, nonce: u64) -> bool {
    let key = consumed_key(account, nonce);
    runtime::get_key(&key).is_some()
}

// ── Quote Hash ──────────────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn compute_quote_hash(
    domain_separator: &[u8],
    payer: &str,
    merchant: &str,
    gross_amount: U512,
    route: u8,
    request_id: &str,
    valid_until_ms: u64,
    nonce: u64,
) -> [u8; 32] {
    types::compute_quote_hash(
        domain_separator,
        payer,
        merchant,
        gross_amount.to_string().parse().unwrap_or(0),
        route,
        request_id,
        valid_until_ms,
        nonce,
    )
}

fn read_domain_separator() -> Vec<u8> {
    match runtime::get_key(KEY_DOMAIN_SEPARATOR) {
        Some(casper_types::Key::URef(uref)) => storage::read::<Vec<u8>>(uref)
            .unwrap_or_revert()
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

// ── Signature Verification ──────────────────────────────────────────────────

fn require_valid_signature(quote_hash: &[u8; 32], signature: &[u8], signer_hex: &str) {
    let signer_bytes = types::hex_decode(signer_hex);

    let key_bytes: [u8; 32] = match signer_bytes.as_slice().try_into() {
        Ok(b) => b,
        Err(_) => runtime::revert(ApiError::User(ERR_INVALID_SIGNATURE)),
    };

    let public_key = match VerifyingKey::from_bytes(&key_bytes) {
        Ok(pk) => pk,
        Err(_) => runtime::revert(ApiError::User(ERR_INVALID_SIGNATURE)),
    };

    let sig_bytes: [u8; 64] = match signature.try_into() {
        Ok(b) => b,
        Err(_) => runtime::revert(ApiError::User(ERR_INVALID_SIGNATURE)),
    };

    let sig = Signature::from_bytes(&sig_bytes);

    if public_key.verify(quote_hash, &sig).is_err() {
        runtime::revert(ApiError::User(ERR_INVALID_SIGNATURE));
    }
}

// ── RBAC ────────────────────────────────────────────────────────────────────

fn require_admin() {
    let caller = runtime::get_caller().to_formatted_string();
    if caller != read_string(KEY_ADMIN) {
        runtime::revert(ApiError::User(ERR_UNAUTHORIZED));
    }
}

fn require_pauser() {
    let caller = runtime::get_caller().to_formatted_string();
    let pauser = read_string(KEY_PAUSER);
    let admin = read_string(KEY_ADMIN);
    if caller != pauser && caller != admin {
        runtime::revert(ApiError::User(ERR_UNAUTHORIZED));
    }
}

fn require_role_separation(target: &str, role: &str) {
    let admin = read_string(KEY_ADMIN);
    let signer = read_string(KEY_SIGNER);
    let pauser = read_string(KEY_PAUSER);
    if types::check_role_separation(target, &admin, &signer, &pauser, role).is_err() {
        runtime::revert(ApiError::User(ERR_ADMIN_EQUALS_SIGNER));
    }
}

// ── Entry Points ────────────────────────────────────────────────────────────

pub fn execute_settle_native() {
    if read_bool(KEY_PAUSED) {
        runtime::revert(ApiError::User(ERR_PAUSED));
    }

    let payer_raw: String = runtime::get_named_arg(ARG_PAYER);
    let merchant_raw: String = runtime::get_named_arg(ARG_MERCHANT);
    let gross: U512 = runtime::get_named_arg(ARG_GROSS_AMOUNT);
    let route: u8 = runtime::get_named_arg(ARG_ROUTE);
    let request_id: String = runtime::get_named_arg(ARG_REQUEST_ID);
    let valid_until_ms: u64 = runtime::get_named_arg(ARG_VALID_UNTIL_MS);
    let nonce: u64 = runtime::get_named_arg(ARG_NONCE);
    let signature: Vec<u8> = runtime::get_named_arg(ARG_SIGNATURE);

    require_identifier(&request_id);

    let payer = parse_account(&payer_raw);
    let caller = runtime::get_caller();
    if payer != caller {
        runtime::revert(ApiError::User(ERR_INVALID_PAYER));
    }

    if gross.is_zero() {
        runtime::revert(ApiError::User(ERR_INVALID_AMOUNT));
    }

    validate_expiry(valid_until_ms);

    let merchant = parse_account(&merchant_raw);
    if payer == merchant {
        runtime::revert(ApiError::User(ERR_SELF_PAYMENT));
    }

    let profile = require_valid_profile(route);

    let current_nonce = get_payer_nonce(&payer);
    if nonce != current_nonce {
        runtime::revert(ApiError::User(ERR_INVALID_NONCE));
    }
    if is_nonce_consumed(&payer, nonce) {
        runtime::revert(ApiError::User(ERR_NONCE_CONSUMED));
    }

    let domain_separator = read_domain_separator();
    let quote_hash = compute_quote_hash(
        &domain_separator,
        &payer_raw,
        &merchant_raw,
        gross,
        route,
        &request_id,
        valid_until_ms,
        nonce,
    );

    let signer_hex = read_string(KEY_SIGNER);
    require_valid_signature(&quote_hash, &signature, &signer_hex);

    mark_nonce_consumed(&payer, nonce);
    increment_nonce(&payer);

    let gross_u128: u128 = gross.to_string().parse().unwrap_or(0);
    let (merchant_amount, treasury_amount, creator_amount) =
        types::split_gross_bps(gross_u128, profile.treasury_bps, profile.creator_bps)
            .unwrap_or_else(|e| match e {
                types::SplitError::ZeroAmount => {
                    runtime::revert(ApiError::User(ERR_INVALID_AMOUNT))
                }
                types::SplitError::FeeRoundsToZero => {
                    runtime::revert(ApiError::User(ERR_FEE_ROUNDS_TO_ZERO))
                }
                types::SplitError::FeeTooHigh => runtime::revert(ApiError::User(ERR_FEE_TOO_HIGH)),
                types::SplitError::InvalidRoute => {
                    runtime::revert(ApiError::User(ERR_UNKNOWN_ROUTE))
                }
            });

    let treasury = resolve_treasury(&profile);

    let merchant_u512 = U512::from(merchant_amount);
    let treasury_u512 = U512::from(treasury_amount);
    let creator_u512 = U512::from(creator_amount);

    system::transfer_to_account(merchant, merchant_u512, None)
        .unwrap_or_revert_with(ApiError::User(ERR_TRANSFER_FAILED));
    if !treasury_u512.is_zero() {
        let treasury_account = parse_account(&treasury);
        system::transfer_to_account(treasury_account, treasury_u512, None)
            .unwrap_or_revert_with(ApiError::User(ERR_TRANSFER_FAILED));
    }
    if !creator_u512.is_zero() {
        let creator_raw: String = runtime::get_named_arg(ARG_MERCHANT);
        let creator = parse_account(&creator_raw);
        system::transfer_to_account(creator, creator_u512, None)
            .unwrap_or_revert_with(ApiError::User(ERR_TRANSFER_FAILED));
    }
}

pub fn execute_get_payer_nonce() {
    let payer_raw: String = runtime::get_named_arg(ARG_PAYER);
    let payer = parse_account(&payer_raw);
    let nonce = get_payer_nonce(&payer);
    runtime::ret(CLValue::from_t(nonce).unwrap_or_revert());
}

pub fn execute_quote_hash() {
    let payer_raw: String = runtime::get_named_arg(ARG_PAYER);
    let merchant_raw: String = runtime::get_named_arg(ARG_MERCHANT);
    let gross: U512 = runtime::get_named_arg(ARG_GROSS_AMOUNT);
    let route: u8 = runtime::get_named_arg(ARG_ROUTE);
    let request_id: String = runtime::get_named_arg(ARG_REQUEST_ID);
    let valid_until_ms: u64 = runtime::get_named_arg(ARG_VALID_UNTIL_MS);
    let nonce: u64 = runtime::get_named_arg(ARG_NONCE);

    let domain_separator = read_domain_separator();
    let hash = compute_quote_hash(
        &domain_separator,
        &payer_raw,
        &merchant_raw,
        gross,
        route,
        &request_id,
        valid_until_ms,
        nonce,
    );

    let hash_vec: Vec<u8> = hash.to_vec();
    runtime::ret(CLValue::from_t(hash_vec).unwrap_or_revert());
}

pub fn execute_grant_signer_role() {
    require_admin();
    let signer: String = runtime::get_named_arg(ARG_SIGNER);
    require_role_separation(&signer, "signer");
    let parsed = parse_account(&signer);
    crate::storage::write_string(KEY_SIGNER, parsed.to_formatted_string());
}

pub fn execute_revoke_signer_role() {
    require_admin();
    crate::storage::write_string(KEY_SIGNER, String::new());
}

pub fn execute_grant_pauser_role() {
    require_admin();
    let pauser: String = runtime::get_named_arg(ARG_SIGNER);
    require_role_separation(&pauser, "pauser");
    let parsed = parse_account(&pauser);
    crate::storage::write_string(KEY_PAUSER, parsed.to_formatted_string());
}

pub fn execute_revoke_pauser_role() {
    require_admin();
    crate::storage::write_string(KEY_PAUSER, String::new());
}

pub fn execute_pause() {
    require_pauser();
    write_bool(KEY_PAUSED, true);
}

pub fn execute_unpause() {
    require_admin();
    write_bool(KEY_PAUSED, false);
}

pub fn execute_configure_route() {
    require_admin();
    let route: u8 = runtime::get_named_arg(ARG_ROUTE);
    let treasury_bps: u16 = runtime::get_named_arg(ARG_TREASURY_BPS);
    let creator_bps: u16 = runtime::get_named_arg(ARG_CREATOR_BPS);
    let enabled: bool = runtime::get_named_arg(ARG_ENABLED);
    let route_treasury: Option<String> = runtime::get_named_arg(ARG_ROUTE_TREASURY);

    if treasury_bps > MAX_TREASURY_BPS {
        runtime::revert(ApiError::User(ERR_FEE_TOO_HIGH));
    }
    if creator_bps > MAX_IP_CREATOR_BPS {
        runtime::revert(ApiError::User(ERR_CREATOR_FEE_TOO_HIGH));
    }
    if treasury_bps > 0 && route_treasury.is_none() {
        runtime::revert(ApiError::User(ERR_ZERO_TREASURY));
    }

    let profile = RouteProfile {
        treasury_bps,
        creator_bps,
        enabled,
        route_treasury,
    };
    store_profile(route, &profile);
}

pub fn execute_disable_route() {
    require_admin();
    let route: u8 = runtime::get_named_arg(ARG_ROUTE);
    let mut profile = read_profile(route).unwrap_or_revert_with(ApiError::User(ERR_UNKNOWN_ROUTE));
    profile.enabled = false;
    store_profile(route, &profile);
}

pub fn execute_enable_route() {
    require_admin();
    let route: u8 = runtime::get_named_arg(ARG_ROUTE);
    let mut profile = read_profile(route).unwrap_or_revert_with(ApiError::User(ERR_UNKNOWN_ROUTE));
    profile.enabled = true;
    store_profile(route, &profile);
}

pub fn execute_get_profile() {
    let route: u8 = runtime::get_named_arg(ARG_ROUTE);
    let profile = read_profile(route).unwrap_or_revert_with(ApiError::User(ERR_UNKNOWN_ROUTE));
    let json = profile.to_json();
    runtime::ret(CLValue::from_t(json).unwrap_or_revert());
}

pub fn execute_get_route_ids() {
    let ids_key = "route_ids";
    let ids: Vec<u8> = match runtime::get_key(ids_key) {
        Some(casper_types::Key::URef(uref)) => storage::read::<Vec<u8>>(uref)
            .unwrap_or_revert()
            .unwrap_or_default(),
        _ => Vec::new(),
    };
    runtime::ret(CLValue::from_t(ids).unwrap_or_revert());
}
