use casper_contract::{contract_api::runtime, unwrap_or_revert::UnwrapOrRevert};
use casper_types::{account::AccountHash, api_error::ApiError};

use crate::types::{
    ERR_EXPIRED, ERR_EXPIRY_TOO_FAR, ERR_INVALID_IDENTIFIER, ERR_INVALID_WALLET, ERR_OVERFLOW,
    EXPIRY_MAX_AHEAD_MS,
};

pub fn valid_identifier(value: &str) -> bool {
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

pub fn require_identifier(value: &str) {
    if !valid_identifier(value) {
        runtime::revert(ApiError::User(ERR_INVALID_IDENTIFIER));
    }
}

pub fn parse_account(value: &str) -> AccountHash {
    AccountHash::from_formatted_str(value)
        .unwrap_or_else(|_| runtime::revert(ApiError::User(ERR_INVALID_WALLET)))
}

pub fn validate_expiry(valid_until_ms: u64) {
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
