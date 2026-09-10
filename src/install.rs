use alloc::{
    string::{String, ToString},
    vec,
};
use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    contracts::NamedKeys, CLType, EntityEntryPoint, EntryPointAccess, EntryPointPayment,
    EntryPointType, EntryPoints, Key, Parameter, URef,
};

use crate::{
    constants::{
        ARG_ADMIN, ARG_GROSS_AMOUNT, ARG_MERCHANT, ARG_PAUSED, ARG_REQUEST_ID, ARG_ROUTE,
        ARG_TREASURY, ARG_VALID_UNTIL_MS, EP_GET_PAYMENT_COUNT, EP_PAY, EP_SET_ADMIN,
        EP_SET_PAUSED, EP_SET_TREASURY, KEY_ADMIN, KEY_CONTRACT_HASH, KEY_CONTRACT_VERSION,
        KEY_EVENTS, KEY_EVENT_COUNT, KEY_PAUSED, KEY_PAYMENTS, KEY_PAYMENT_COUNT, KEY_TREASURY,
    },
    validation::parse_account,
};

pub fn build_entry_points() -> EntryPoints {
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

pub fn execute_call() {
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
}
