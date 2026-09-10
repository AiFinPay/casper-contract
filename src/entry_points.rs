use alloc::{
    boxed::Box,
    string::{String, ToString},
    vec,
    vec::Vec,
};
use casper_contract::contract_api::{runtime, storage};
use casper_types::{
    contracts::NamedKeys, CLType, EntityEntryPoint, EntryPointAccess, EntryPointPayment,
    EntryPointType, EntryPoints, Key, Parameter, URef,
};

use crate::types::{
    ARG_CREATOR_BPS, ARG_ENABLED, ARG_GROSS_AMOUNT, ARG_MERCHANT, ARG_NONCE, ARG_PAYER,
    ARG_REQUEST_ID, ARG_ROUTE, ARG_ROUTE_TREASURY, ARG_SIGNATURE, ARG_SIGNER, ARG_TREASURY_BPS,
    ARG_VALID_UNTIL_MS, EP_CONFIGURE_ROUTE, EP_DISABLE_ROUTE, EP_ENABLE_ROUTE, EP_GET_PAYER_NONCE,
    EP_GET_PROFILE, EP_GET_ROUTE_IDS, EP_GRANT_PAUSER_ROLE, EP_GRANT_SIGNER_ROLE, EP_PAUSE,
    EP_QUOTE_HASH, EP_REVOKE_PAUSER_ROLE, EP_REVOKE_SIGNER_ROLE, EP_SETTLE_NATIVE, EP_UNPAUSE,
    KEY_ADMIN, KEY_CONTRACT_HASH, KEY_CONTRACT_VERSION, KEY_DOMAIN_SEPARATOR, KEY_PAUSED,
    KEY_PAUSER, KEY_SIGNER, KEY_TREASURY,
};

pub fn build_entry_points() -> EntryPoints {
    let mut eps = EntryPoints::new();

    eps.add_entry_point(EntityEntryPoint::new(
        EP_SETTLE_NATIVE,
        vec![
            Parameter::new(ARG_PAYER, CLType::String),
            Parameter::new(ARG_MERCHANT, CLType::String),
            Parameter::new(ARG_GROSS_AMOUNT, CLType::U512),
            Parameter::new(ARG_ROUTE, CLType::U8),
            Parameter::new(ARG_REQUEST_ID, CLType::String),
            Parameter::new(ARG_VALID_UNTIL_MS, CLType::U64),
            Parameter::new(ARG_NONCE, CLType::U64),
            Parameter::new(ARG_SIGNATURE, CLType::List(Box::new(CLType::U8))),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_GRANT_SIGNER_ROLE,
        vec![Parameter::new(ARG_SIGNER, CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_REVOKE_SIGNER_ROLE,
        vec![],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_GRANT_PAUSER_ROLE,
        vec![Parameter::new(ARG_SIGNER, CLType::String)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_REVOKE_PAUSER_ROLE,
        vec![],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_PAUSE,
        vec![],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_UNPAUSE,
        vec![],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_CONFIGURE_ROUTE,
        vec![
            Parameter::new(ARG_ROUTE, CLType::U8),
            Parameter::new(ARG_TREASURY_BPS, CLType::U32),
            Parameter::new(ARG_CREATOR_BPS, CLType::U32),
            Parameter::new(ARG_ENABLED, CLType::Bool),
            Parameter::new(ARG_ROUTE_TREASURY, CLType::Option(Box::new(CLType::String))),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_DISABLE_ROUTE,
        vec![Parameter::new(ARG_ROUTE, CLType::U8)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_ENABLE_ROUTE,
        vec![Parameter::new(ARG_ROUTE, CLType::U8)],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_GET_PROFILE,
        vec![Parameter::new(ARG_ROUTE, CLType::U8)],
        CLType::String,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_GET_ROUTE_IDS,
        vec![],
        CLType::List(Box::new(CLType::U8)),
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_GET_PAYER_NONCE,
        vec![Parameter::new(ARG_PAYER, CLType::String)],
        CLType::U64,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps.add_entry_point(EntityEntryPoint::new(
        EP_QUOTE_HASH,
        vec![
            Parameter::new(ARG_PAYER, CLType::String),
            Parameter::new(ARG_MERCHANT, CLType::String),
            Parameter::new(ARG_GROSS_AMOUNT, CLType::U512),
            Parameter::new(ARG_ROUTE, CLType::U8),
            Parameter::new(ARG_REQUEST_ID, CLType::String),
            Parameter::new(ARG_VALID_UNTIL_MS, CLType::U64),
            Parameter::new(ARG_NONCE, CLType::U64),
        ],
        CLType::List(Box::new(CLType::U8)),
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    ));

    eps
}

pub fn install() {
    let paused_uref: URef = storage::new_uref(true);
    let signer_uref: URef = storage::new_uref(String::new());
    let pauser_uref: URef = storage::new_uref(String::new());
    let admin_uref: URef = storage::new_uref(String::new());
    let treasury_uref: URef = storage::new_uref(String::new());
    let domain_separator_uref: URef = storage::new_uref(Vec::<u8>::new());
    let route_ids_uref: URef = storage::new_uref(Vec::<u8>::new());

    let mut named_keys = NamedKeys::new();
    named_keys.insert(KEY_PAUSED.to_string(), Key::URef(paused_uref));
    named_keys.insert(KEY_SIGNER.to_string(), Key::URef(signer_uref));
    named_keys.insert(KEY_PAUSER.to_string(), Key::URef(pauser_uref));
    named_keys.insert(KEY_ADMIN.to_string(), Key::URef(admin_uref));
    named_keys.insert(KEY_TREASURY.to_string(), Key::URef(treasury_uref));
    named_keys.insert(
        KEY_DOMAIN_SEPARATOR.to_string(),
        Key::URef(domain_separator_uref),
    );
    named_keys.insert("route_ids".to_string(), Key::URef(route_ids_uref));

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
