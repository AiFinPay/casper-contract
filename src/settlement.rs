use alloc::{format, string::String};
use casper_contract::{
    contract_api::{runtime, storage, system},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{api_error::ApiError, CLValue};

use crate::{
    constants::{
        ARG_GROSS_AMOUNT, ARG_MERCHANT, ARG_REQUEST_ID, ARG_ROUTE, ARG_VALID_UNTIL_MS, KEY_PAUSED,
        KEY_PAYMENTS, KEY_PAYMENT_COUNT, KEY_TREASURY,
    },
    errors::{
        SplitError, ERR_ALREADY_SETTLED, ERR_FEE_ROUNDS_TO_ZERO, ERR_INVALID_AMOUNT,
        ERR_INVALID_ROUTE, ERR_PAUSED, ERR_SELF_PAYMENT, ERR_TRANSFER_FAILED,
    },
    events::emit_event,
    storage::{checked_increment, get_uref, read_bool, read_string, read_u64, write_u64},
    validation::{parse_account, require_identifier, validate_expiry},
};

fn split_gross(route: u8, gross: casper_types::U512) -> (casper_types::U512, casper_types::U512) {
    crate::errors::split_gross(route, gross).unwrap_or_else(|error| match error {
        SplitError::ZeroAmount => runtime::revert(ApiError::User(ERR_INVALID_AMOUNT)),
        SplitError::FeeRoundsToZero => runtime::revert(ApiError::User(ERR_FEE_ROUNDS_TO_ZERO)),
        SplitError::InvalidRoute => runtime::revert(ApiError::User(ERR_INVALID_ROUTE)),
    })
}

pub fn execute_pay() {
    if read_bool(KEY_PAUSED) {
        runtime::revert(ApiError::User(ERR_PAUSED));
    }

    let route: u8 = runtime::get_named_arg(ARG_ROUTE);
    let merchant_raw: String = runtime::get_named_arg(ARG_MERCHANT);
    let gross: casper_types::U512 = runtime::get_named_arg(ARG_GROSS_AMOUNT);
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

pub fn execute_get_payment_count() {
    let count = read_u64(KEY_PAYMENT_COUNT);
    runtime::ret(CLValue::from_t(count).unwrap_or_revert());
}
