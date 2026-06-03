#![no_std]
#![no_main]

extern crate alloc;

use alloc::{
    format,
    string::{String, ToString},
    vec,
};

use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    CLType, CLValue, EntityEntryPoint, EntryPointAccess, EntryPointPayment,
    EntryPointType, EntryPoints, Key, Parameter, URef, U512,
    api_error::ApiError,
    contracts::NamedKeys,
};

// ── Storage keys ─────────────────────────────────────────────────────────────
const KEY_AGENTS: &str = "agents";
const KEY_PAYMENTS: &str = "payments";
const KEY_EVENTS: &str = "events";
const KEY_PAYMENT_COUNT: &str = "payment_count";
const KEY_EVENT_COUNT: &str = "event_count";
const KEY_CONTRACT_HASH: &str = "aifinpay_casper_hash";
const KEY_CONTRACT_VERSION: &str = "aifinpay_casper_version";

// ── Entry point names ─────────────────────────────────────────────────────────
const EP_REGISTER_AGENT: &str = "register_agent";
const EP_PAY_AGENT: &str = "pay_agent";
const EP_GET_PAYMENT_COUNT: &str = "get_payment_count";

// ── Argument names ────────────────────────────────────────────────────────────
const ARG_AGENT_ID: &str = "agent_id";
const ARG_WALLET: &str = "wallet";
const ARG_FROM_AGENT: &str = "from_agent";
const ARG_TO_AGENT: &str = "to_agent";
const ARG_AMOUNT: &str = "amount";
const ARG_REQUEST_ID: &str = "request_id";

// ── Error codes ───────────────────────────────────────────────────────────────
const ERR_MISSING_KEY: u16 = 1;
const ERR_ALREADY_REGISTERED: u16 = 100;
const ERR_AGENT_NOT_FOUND: u16 = 101;
const ERR_ALREADY_SETTLED: u16 = 102;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

fn emit_event(event_type: &str, payload: &str) {
    let seed = get_uref(KEY_EVENTS);
    let idx = read_u64(KEY_EVENT_COUNT);
    storage::dictionary_put(
        seed,
        &format!("evt_{}", idx),
        format!("{{\"type\":\"{}\",\"payload\":{}}}", event_type, payload),
    );
    write_u64(KEY_EVENT_COUNT, idx + 1);
}

// ── Entry points ──────────────────────────────────────────────────────────────

/// Register an AI agent with the settlement layer.
/// Args: agent_id (String), wallet (String)
#[no_mangle]
pub extern "C" fn register_agent() {
    let agent_id: String = runtime::get_named_arg(ARG_AGENT_ID);
    let wallet: String = runtime::get_named_arg(ARG_WALLET);

    let seed = get_uref(KEY_AGENTS);

    let existing: Option<String> = storage::dictionary_get(seed, &agent_id).unwrap_or_revert();
    if existing.is_some() {
        runtime::revert(ApiError::User(ERR_ALREADY_REGISTERED));
    }

    storage::dictionary_put(seed, &agent_id, wallet.clone());

    emit_event(
        "AgentRegistered",
        &format!(
            "{{\"agent_id\":\"{}\",\"wallet\":\"{}\"}}",
            agent_id, wallet
        ),
    );
}

/// Settle a payment between two registered AI agents and emit PaymentSettled.
/// Args: from_agent (String), to_agent (String), amount (U512 motes), request_id (String)
#[no_mangle]
pub extern "C" fn pay_agent() {
    let from_agent: String = runtime::get_named_arg(ARG_FROM_AGENT);
    let to_agent: String = runtime::get_named_arg(ARG_TO_AGENT);
    let amount: U512 = runtime::get_named_arg(ARG_AMOUNT);
    let request_id: String = runtime::get_named_arg(ARG_REQUEST_ID);

    let agents_seed = get_uref(KEY_AGENTS);
    let payments_seed = get_uref(KEY_PAYMENTS);

    // Both agents must be registered
    let _: String = storage::dictionary_get(agents_seed, &from_agent)
        .unwrap_or_revert()
        .unwrap_or_revert_with(ApiError::User(ERR_AGENT_NOT_FOUND));

    let _: String = storage::dictionary_get(agents_seed, &to_agent)
        .unwrap_or_revert()
        .unwrap_or_revert_with(ApiError::User(ERR_AGENT_NOT_FOUND));

    // Idempotent — reject duplicate request IDs
    let existing: Option<String> =
        storage::dictionary_get(payments_seed, &request_id).unwrap_or_revert();
    if existing.is_some() {
        runtime::revert(ApiError::User(ERR_ALREADY_SETTLED));
    }

    // Record settlement on-chain
    let record = format!(
        "{{\"from\":\"{}\",\"to\":\"{}\",\"amount\":\"{}\",\"request_id\":\"{}\",\"status\":\"SETTLED\"}}",
        from_agent, to_agent, amount, request_id
    );
    storage::dictionary_put(payments_seed, &request_id, record);

    let count = read_u64(KEY_PAYMENT_COUNT);
    write_u64(KEY_PAYMENT_COUNT, count + 1);

    // Emit PaymentSettled event
    emit_event(
        "PaymentSettled",
        &format!(
            "{{\"from\":\"{}\",\"to\":\"{}\",\"amount\":\"{}\",\"request_id\":\"{}\"}}",
            from_agent, to_agent, amount, request_id
        ),
    );
}

/// Returns total settled payments count.
#[no_mangle]
pub extern "C" fn get_payment_count() {
    let count = read_u64(KEY_PAYMENT_COUNT);
    runtime::ret(CLValue::from_t(count).unwrap_or_revert());
}

// ── Contract installation ─────────────────────────────────────────────────────

fn build_entry_points() -> EntryPoints {
    let mut eps = EntryPoints::new();

    eps.add_entry_point(EntityEntryPoint::new(
        EP_REGISTER_AGENT,
        vec![
            Parameter::new(ARG_AGENT_ID, CLType::String),
            Parameter::new(ARG_WALLET, CLType::String),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_PAY_AGENT,
        vec![
            Parameter::new(ARG_FROM_AGENT, CLType::String),
            Parameter::new(ARG_TO_AGENT, CLType::String),
            Parameter::new(ARG_AMOUNT, CLType::U512),
            Parameter::new(ARG_REQUEST_ID, CLType::String),
        ],
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

/// Called once on deploy — installs the contract and initialises storage.
#[no_mangle]
pub extern "C" fn call() {
    let agents_uref = storage::new_dictionary(KEY_AGENTS).unwrap_or_revert();
    let payments_uref = storage::new_dictionary(KEY_PAYMENTS).unwrap_or_revert();
    let events_uref = storage::new_dictionary(KEY_EVENTS).unwrap_or_revert();
    let payment_count_uref: URef = storage::new_uref(0u64);
    let event_count_uref: URef = storage::new_uref(0u64);

    let mut named_keys = NamedKeys::new();
    named_keys.insert(KEY_AGENTS.to_string(), Key::URef(agents_uref));
    named_keys.insert(KEY_PAYMENTS.to_string(), Key::URef(payments_uref));
    named_keys.insert(KEY_EVENTS.to_string(), Key::URef(events_uref));
    named_keys.insert(KEY_PAYMENT_COUNT.to_string(), Key::URef(payment_count_uref));
    named_keys.insert(KEY_EVENT_COUNT.to_string(), Key::URef(event_count_uref));

    let (contract_hash, contract_version) = storage::new_contract(
        build_entry_points(),
        Some(named_keys),
        Some(KEY_CONTRACT_HASH.to_string()),
        Some(KEY_CONTRACT_VERSION.to_string()),
        None, // no message topics
    );

    runtime::put_key(KEY_CONTRACT_HASH, Key::Hash(contract_hash.value()));
    runtime::put_key(
        KEY_CONTRACT_VERSION,
        Key::URef(storage::new_uref(contract_version)),
    );
}
