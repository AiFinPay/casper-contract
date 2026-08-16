#![no_std]
#![no_main]

extern crate alloc;

use aifinpay_casper::{split_gross as canonical_split_gross, SplitError};
use alloc::{
    format,
    string::{String, ToString},
    vec,
};

use casper_contract::{
    contract_api::{runtime, storage, system},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    account::AccountHash, api_error::ApiError, contracts::NamedKeys, CLType, CLValue,
    EntityEntryPoint, EntryPointAccess, EntryPointPayment, EntryPointType, EntryPoints, Key,
    Parameter, URef, U512,
};

// AiFinPay Casper settlement v3 is a VALUE SETTLEMENT contract only.
// Global AIFP-3 Agent Passport identity (@username + immutable Agent ID + signed
// wallet bindings) lives above the chain and MUST NOT be re-created here.

// ── Storage keys ─────────────────────────────────────────────────────────────
const KEY_PAYMENTS: &str = "payments";
const KEY_EVENTS: &str = "events";
const KEY_PAYMENT_COUNT: &str = "payment_count";
const KEY_EVENT_COUNT: &str = "event_count";
const KEY_ADMIN: &str = "admin";
const KEY_TREASURY: &str = "treasury";
const KEY_PAUSED: &str = "paused";
const KEY_CONTRACT_HASH: &str = "aifinpay_casper_v3_hash";
const KEY_CONTRACT_VERSION: &str = "aifinpay_casper_v3_version";

// ── Entry points ──────────────────────────────────────────────────────────────
const EP_PAY: &str = "pay";
const EP_SET_PAUSED: &str = "set_paused";
const EP_SET_TREASURY: &str = "set_treasury";
const EP_SET_ADMIN: &str = "set_admin";
const EP_GET_PAYMENT_COUNT: &str = "get_payment_count";

// ── Arguments ────────────────────────────────────────────────────────────────
const ARG_ROUTE: &str = "route";
const ARG_MERCHANT: &str = "merchant";
const ARG_GROSS_AMOUNT: &str = "gross_amount";
const ARG_REQUEST_ID: &str = "request_id";
const ARG_VALID_UNTIL_MS: &str = "valid_until_ms";
const ARG_PAUSED: &str = "paused";
const ARG_TREASURY: &str = "treasury";
const ARG_ADMIN: &str = "admin";

const EXPIRY_MAX_AHEAD_MS: u64 = 20 * 60 * 1000;

// ── Error codes (stable for SDK/E2E assertions) ──────────────────────────────
const ERR_MISSING_KEY: u16 = 1;
const ERR_ALREADY_SETTLED: u16 = 102;
const ERR_UNAUTHORIZED: u16 = 103;
const ERR_INVALID_WALLET: u16 = 104;
const ERR_INVALID_IDENTIFIER: u16 = 105;
const ERR_INVALID_AMOUNT: u16 = 106;
const ERR_SELF_PAYMENT: u16 = 107;
const ERR_TRANSFER_FAILED: u16 = 108;
const ERR_OVERFLOW: u16 = 109;
const ERR_INVALID_ROUTE: u16 = 110;
const ERR_PAUSED: u16 = 111;
const ERR_EXPIRED: u16 = 112;
const ERR_EXPIRY_TOO_FAR: u16 = 113;
const ERR_FEE_ROUNDS_TO_ZERO: u16 = 114;

fn get_uref(name: &str) -> URef {
    match runtime::get_key(name).unwrap_or_revert_with(ApiError::User(ERR_MISSING_KEY)) {
        Key::URef(uref) => uref,
        _ => runtime::revert(ApiError::User(ERR_MISSING_KEY)),
    }
}

fn read_u64(key: &str) -> u64 {
    storage::read::<u64>(get_uref(key))
        .unwrap_or_revert()
        .unwrap_or(0u64)
}

fn write_u64(key: &str, value: u64) {
    storage::write(get_uref(key), value);
}

fn read_string(key: &str) -> String {
    storage::read::<String>(get_uref(key))
        .unwrap_or_revert()
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_KEY))
}

fn write_string(key: &str, value: String) {
    storage::write(get_uref(key), value);
}

fn read_bool(key: &str) -> bool {
    storage::read::<bool>(get_uref(key))
        .unwrap_or_revert()
        .unwrap_or(true)
}

fn write_bool(key: &str, value: bool) {
    storage::write(get_uref(key), value);
}

fn checked_increment(value: u64) -> u64 {
    value
        .checked_add(1)
        .unwrap_or_revert_with(ApiError::User(ERR_OVERFLOW))
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric()
                || byte == b'-'
                || byte == b'_'
                || byte == b'.'
                || byte == b':'
        })
}

fn require_identifier(value: &str) {
    if !valid_identifier(value) {
        runtime::revert(ApiError::User(ERR_INVALID_IDENTIFIER));
    }
}

fn parse_account(value: &str) -> AccountHash {
    AccountHash::from_formatted_str(value)
        .unwrap_or_else(|_| runtime::revert(ApiError::User(ERR_INVALID_WALLET)))
}

fn require_admin() {
    let caller = runtime::get_caller().to_formatted_string();
    if caller != read_string(KEY_ADMIN) {
        runtime::revert(ApiError::User(ERR_UNAUTHORIZED));
    }
}

fn emit_event(event_type: &str, payload: &str) {
    let seed = get_uref(KEY_EVENTS);
    let idx = read_u64(KEY_EVENT_COUNT);
    storage::dictionary_put(
        seed,
        &format!("evt_{}", idx),
        format!("{{\"type\":\"{}\",\"payload\":{}}}", event_type, payload),
    );
    write_u64(KEY_EVENT_COUNT, checked_increment(idx));
}

fn split_gross(route: u8, gross: U512) -> (U512, U512) {
    canonical_split_gross(route, gross).unwrap_or_else(|error| match error {
        SplitError::ZeroAmount => runtime::revert(ApiError::User(ERR_INVALID_AMOUNT)),
        SplitError::FeeRoundsToZero => runtime::revert(ApiError::User(ERR_FEE_ROUNDS_TO_ZERO)),
        SplitError::InvalidRoute => runtime::revert(ApiError::User(ERR_INVALID_ROUTE)),
    })
}

fn validate_expiry(valid_until_ms: u64) {
    let now_ms = runtime::get_blocktime().value();
    if valid_until_ms < now_ms {
        runtime::revert(ApiError::User(ERR_EXPIRED));
    }
    let max = now_ms
        .checked_add(EXPIRY_MAX_AHEAD_MS)
        .unwrap_or_revert_with(ApiError::User(ERR_OVERFLOW));
    if valid_until_ms > max {
        runtime::revert(ApiError::User(ERR_EXPIRY_TOO_FAR));
    }
}

// ── Settlement ───────────────────────────────────────────────────────────────

/// Canonical CSPR settlement.
///
/// Args:
/// - route: 1=AIFP-1 (99/1/0), 2=AIFP-2 (100/0/0)
/// - merchant: formatted `account-hash-...`
/// - gross_amount: payer total in motes
/// - request_id: unique idempotency/payment id
/// - valid_until_ms: block-time expiry, max 20 minutes ahead
///
/// The caller is the payer. No caller-supplied `from_agent` is accepted.
#[no_mangle]
pub extern "C" fn pay() {
    if read_bool(KEY_PAUSED) {
        runtime::revert(ApiError::User(ERR_PAUSED));
    }

    let route: u8 = runtime::get_named_arg(ARG_ROUTE);
    let merchant_raw: String = runtime::get_named_arg(ARG_MERCHANT);
    let gross: U512 = runtime::get_named_arg(ARG_GROSS_AMOUNT);
    let request_id: String = runtime::get_named_arg(ARG_REQUEST_ID);
    let valid_until_ms: u64 = runtime::get_named_arg(ARG_VALID_UNTIL_MS);

    require_identifier(&request_id);
    validate_expiry(valid_until_ms);

    let payer = runtime::get_caller();
    let merchant = parse_account(&merchant_raw);
    if payer == merchant {
        runtime::revert(ApiError::User(ERR_SELF_PAYMENT));
    }

    let treasury_raw = read_string(KEY_TREASURY);
    let treasury = parse_account(&treasury_raw);
    let (merchant_amount, treasury_amount) = split_gross(route, gross);

    // Replay is checked BEFORE any transfer. Casper execution reverts atomically
    // on a later transfer failure, so no receipt survives an unsuccessful pay.
    let payments_seed = get_uref(KEY_PAYMENTS);
    let existing: Option<String> =
        storage::dictionary_get(payments_seed, &request_id).unwrap_or_revert();
    if existing.is_some() {
        runtime::revert(ApiError::User(ERR_ALREADY_SETTLED));
    }

    system::transfer_to_account(merchant, merchant_amount, None)
        .unwrap_or_revert_with(ApiError::User(ERR_TRANSFER_FAILED));
    if !treasury_amount.is_zero() {
        system::transfer_to_account(treasury, treasury_amount, None)
            .unwrap_or_revert_with(ApiError::User(ERR_TRANSFER_FAILED));
    }

    let payer_raw = payer.to_formatted_string();
    let record = format!(
        "{{\"route\":{},\"payer\":\"{}\",\"merchant\":\"{}\",\"gross_amount\":\"{}\",\"merchant_amount\":\"{}\",\"treasury_amount\":\"{}\",\"creator_amount\":\"0\",\"request_id\":\"{}\",\"valid_until_ms\":{},\"status\":\"SETTLED\"}}",
        route,
        payer_raw,
        merchant_raw,
        gross,
        merchant_amount,
        treasury_amount,
        request_id,
        valid_until_ms
    );
    storage::dictionary_put(payments_seed, &request_id, record.clone());
    let count = read_u64(KEY_PAYMENT_COUNT);
    write_u64(KEY_PAYMENT_COUNT, checked_increment(count));
    emit_event("PaymentSettled", &record);
}

#[no_mangle]
pub extern "C" fn set_paused() {
    require_admin();
    let paused: bool = runtime::get_named_arg(ARG_PAUSED);
    write_bool(KEY_PAUSED, paused);
    emit_event("PausedChanged", &format!("{{\"paused\":{}}}", paused));
}

#[no_mangle]
pub extern "C" fn set_treasury() {
    require_admin();
    let treasury: String = runtime::get_named_arg(ARG_TREASURY);
    let parsed = parse_account(&treasury);
    write_string(KEY_TREASURY, parsed.to_formatted_string());
    emit_event(
        "TreasuryChanged",
        &format!("{{\"treasury\":\"{}\"}}", parsed.to_formatted_string()),
    );
}

#[no_mangle]
pub extern "C" fn set_admin() {
    require_admin();
    let admin: String = runtime::get_named_arg(ARG_ADMIN);
    let parsed = parse_account(&admin);
    write_string(KEY_ADMIN, parsed.to_formatted_string());
    emit_event(
        "AdminChanged",
        &format!("{{\"admin\":\"{}\"}}", parsed.to_formatted_string()),
    );
}

#[no_mangle]
pub extern "C" fn get_payment_count() {
    let count = read_u64(KEY_PAYMENT_COUNT);
    runtime::ret(CLValue::from_t(count).unwrap_or_revert());
}

fn build_entry_points() -> EntryPoints {
    let mut eps = EntryPoints::new();

    eps.add_entry_point(EntityEntryPoint::new(
        EP_PAY,
        vec![
            Parameter::new(ARG_ROUTE, CLType::U8),
            Parameter::new(ARG_MERCHANT, CLType::String),
            Parameter::new(ARG_GROSS_AMOUNT, CLType::U512),
            Parameter::new(ARG_REQUEST_ID, CLType::String),
            Parameter::new(ARG_VALID_UNTIL_MS, CLType::U64),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_SET_PAUSED,
        vec![Parameter::new(ARG_PAUSED, CLType::Bool)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_SET_TREASURY,
        vec![Parameter::new(ARG_TREASURY, CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_SET_ADMIN,
        vec![Parameter::new(ARG_ADMIN, CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_GET_PAYMENT_COUNT,
        vec![],
        CLType::U64,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps
}

/// New install only. The installer becomes admin; treasury is explicit and
/// validated. Settlement starts PAUSED until deployment evidence and E2E are
/// reviewed. This avoids carrying unsafe v1/v2 state into the canonical route.
#[no_mangle]
pub extern "C" fn call() {
    let treasury_arg: String = runtime::get_named_arg(ARG_TREASURY);
    let treasury = parse_account(&treasury_arg).to_formatted_string();
    let admin = runtime::get_caller().to_formatted_string();

    let payments_uref = storage::new_dictionary(KEY_PAYMENTS).unwrap_or_revert();
    let events_uref = storage::new_dictionary(KEY_EVENTS).unwrap_or_revert();
    let payment_count_uref: URef = storage::new_uref(0u64);
    let event_count_uref: URef = storage::new_uref(0u64);
    let admin_uref: URef = storage::new_uref(admin.clone());
    let treasury_uref: URef = storage::new_uref(treasury.clone());
    let paused_uref: URef = storage::new_uref(true);

    let mut named_keys = NamedKeys::new();
    named_keys.insert(KEY_PAYMENTS.to_string(), Key::URef(payments_uref));
    named_keys.insert(KEY_EVENTS.to_string(), Key::URef(events_uref));
    named_keys.insert(KEY_PAYMENT_COUNT.to_string(), Key::URef(payment_count_uref));
    named_keys.insert(KEY_EVENT_COUNT.to_string(), Key::URef(event_count_uref));
    named_keys.insert(KEY_ADMIN.to_string(), Key::URef(admin_uref));
    named_keys.insert(KEY_TREASURY.to_string(), Key::URef(treasury_uref));
    named_keys.insert(KEY_PAUSED.to_string(), Key::URef(paused_uref));

    let (contract_hash, contract_version) = storage::new_contract(
        build_entry_points(),
        Some(named_keys),
        Some(KEY_CONTRACT_HASH.to_string()),
        Some(KEY_CONTRACT_VERSION.to_string()),
        None,
    );

    runtime::put_key(KEY_CONTRACT_HASH, Key::Hash(contract_hash.value()));
    runtime::put_key(
        KEY_CONTRACT_VERSION,
        Key::URef(storage::new_uref(contract_version)),
    );

    // Installation event is not written inside the new contract context by this
    // session function; deployment evidence must record installer/admin/treasury
    // and contract hash externally and then read named keys before unpausing.
}
