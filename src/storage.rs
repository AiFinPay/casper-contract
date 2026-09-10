use alloc::string::String;
use casper_contract::{contract_api::storage, unwrap_or_revert::UnwrapOrRevert};
use casper_types::{api_error::ApiError, Key, URef};

use crate::types::ERR_MISSING_KEY;

pub fn get_uref(name: &str) -> URef {
    match casper_contract::contract_api::runtime::get_key(name)
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_KEY))
    {
        Key::URef(uref) => uref,
        _ => casper_contract::contract_api::runtime::revert(ApiError::User(ERR_MISSING_KEY)),
    }
}

pub fn read_u64(key: &str) -> u64 {
    storage::read::<u64>(get_uref(key))
        .unwrap_or_revert()
        .unwrap_or(0u64)
}

pub fn write_u64(key: &str, value: u64) {
    storage::write(get_uref(key), value);
}

pub fn read_string(key: &str) -> String {
    storage::read::<String>(get_uref(key))
        .unwrap_or_revert()
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_KEY))
}

pub fn write_string(key: &str, value: String) {
    storage::write(get_uref(key), value);
}

pub fn read_bool(key: &str) -> bool {
    storage::read::<bool>(get_uref(key))
        .unwrap_or_revert()
        .unwrap_or(true)
}

pub fn write_bool(key: &str, value: bool) {
    storage::write(get_uref(key), value);
}

pub fn checked_increment(value: u64) -> u64 {
    value
        .checked_add(1)
        .unwrap_or_revert_with(ApiError::User(crate::types::ERR_OVERFLOW))
}
