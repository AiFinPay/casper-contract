#![no_std]
#![no_main]

extern crate alloc;

use aifinpay_casper::{contract, entry_points};

#[no_mangle]
pub extern "C" fn settle_native() {
    contract::execute_settle_native();
}

#[no_mangle]
pub extern "C" fn grant_signer_role() {
    contract::execute_grant_signer_role();
}

#[no_mangle]
pub extern "C" fn revoke_signer_role() {
    contract::execute_revoke_signer_role();
}

#[no_mangle]
pub extern "C" fn grant_pauser_role() {
    contract::execute_grant_pauser_role();
}

#[no_mangle]
pub extern "C" fn revoke_pauser_role() {
    contract::execute_revoke_pauser_role();
}

#[no_mangle]
pub extern "C" fn pause() {
    contract::execute_pause();
}

#[no_mangle]
pub extern "C" fn unpause() {
    contract::execute_unpause();
}

#[no_mangle]
pub extern "C" fn configure_route() {
    contract::execute_configure_route();
}

#[no_mangle]
pub extern "C" fn disable_route() {
    contract::execute_disable_route();
}

#[no_mangle]
pub extern "C" fn enable_route() {
    contract::execute_enable_route();
}

#[no_mangle]
pub extern "C" fn get_profile() {
    contract::execute_get_profile();
}

#[no_mangle]
pub extern "C" fn get_route_ids() {
    contract::execute_get_route_ids();
}

#[no_mangle]
pub extern "C" fn get_payer_nonce() {
    contract::execute_get_payer_nonce();
}

#[no_mangle]
pub extern "C" fn quote_hash() {
    contract::execute_quote_hash();
}

#[no_mangle]
pub extern "C" fn call() {
    entry_points::install();
}
