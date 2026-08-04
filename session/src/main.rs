#![no_std]
#![no_main]

//! Payer-side session code for AiFinPay settlement on Casper.
//!
//! A contract cannot debit the caller's purse: `transfer_to_account` from a
//! `Called` entry point resolves the account main purse, which is not in the
//! contract's access rights, and the runtime rejects it as a forged reference.
//! Handing the main purse in as an argument does not help either — Casper
//! attenuates it to deposit-only before the contract sees it.
//!
//! So the funds must be placed in a purse the contract may legitimately debit,
//! and that must happen inside the same transaction or the settlement is not
//! atomic. This session runs in the payer's own context, where the main purse
//! IS accessible:
//!
//!   1. create a fresh purse,
//!   2. move exactly `amount` into it from the payer's main purse,
//!   3. call `pay_agent`, handing over that purse.
//!
//! One deploy, so either everything happens or nothing does. The temporary
//! purse holds exactly the payment and nothing more, so the contract can never
//! reach the rest of the payer's balance.

extern crate alloc;

use alloc::string::String;

use casper_contract::{
    contract_api::{account, runtime, system},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{contracts::ContractHash, runtime_args, RuntimeArgs, URef, U512};

const ARG_CONTRACT_HASH: &str = "contract_hash";
const ARG_FROM_AGENT: &str = "from_agent";
const ARG_TO_AGENT: &str = "to_agent";
const ARG_AMOUNT: &str = "amount";
const ARG_REQUEST_ID: &str = "request_id";
const ARG_PURSE: &str = "purse";

const EP_PAY_AGENT: &str = "pay_agent";

#[no_mangle]
pub extern "C" fn call() {
    let contract_hash: ContractHash = runtime::get_named_arg(ARG_CONTRACT_HASH);
    let from_agent: String = runtime::get_named_arg(ARG_FROM_AGENT);
    let to_agent: String = runtime::get_named_arg(ARG_TO_AGENT);
    let amount: U512 = runtime::get_named_arg(ARG_AMOUNT);
    let request_id: String = runtime::get_named_arg(ARG_REQUEST_ID);

    // Fund a purse holding exactly the payment, and nothing else.
    let payment_purse: URef = system::create_purse();
    system::transfer_from_purse_to_purse(account::get_main_purse(), payment_purse, amount, None)
        .unwrap_or_revert();

    runtime::call_contract::<()>(
        contract_hash,
        EP_PAY_AGENT,
        runtime_args! {
            ARG_FROM_AGENT => from_agent,
            ARG_TO_AGENT => to_agent,
            ARG_AMOUNT => amount,
            ARG_REQUEST_ID => request_id,
            ARG_PURSE => payment_purse,
        },
    );
}
