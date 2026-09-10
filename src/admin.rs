use alloc::{format, string::String};
use casper_contract::contract_api::runtime;
use casper_types::api_error::ApiError;

use crate::{
    constants::{ARG_ADMIN, ARG_PAUSED, ARG_TREASURY, KEY_ADMIN},
    errors::ERR_UNAUTHORIZED,
    events::emit_event,
    storage::read_string,
    validation::parse_account,
};

fn require_admin() {
    let caller = runtime::get_caller().to_formatted_string();
    if caller != read_string(KEY_ADMIN) {
        runtime::revert(ApiError::User(ERR_UNAUTHORIZED));
    }
}

pub fn execute_set_paused() {
    require_admin();
    let paused: bool = runtime::get_named_arg(ARG_PAUSED);
    crate::storage::write_bool(crate::constants::KEY_PAUSED, paused);
    emit_event("PausedChanged", &format!("{{\"paused\":{}}}", paused));
}

pub fn execute_set_treasury() {
    require_admin();
    let treasury: String = runtime::get_named_arg(ARG_TREASURY);
    let parsed = parse_account(&treasury);
    crate::storage::write_string(crate::constants::KEY_TREASURY, parsed.to_formatted_string());
    emit_event(
        "TreasuryChanged",
        &format!("{{\"treasury\":\"{}\"}}", parsed.to_formatted_string()),
    );
}

pub fn execute_set_admin() {
    require_admin();
    let admin: String = runtime::get_named_arg(ARG_ADMIN);
    let parsed = parse_account(&admin);
    crate::storage::write_string(crate::constants::KEY_ADMIN, parsed.to_formatted_string());
    emit_event(
        "AdminChanged",
        &format!("{{\"admin\":\"{}\"}}", parsed.to_formatted_string()),
    );
}
