#![no_std]
#![no_main]

extern crate alloc;

use aifinpay_casper::{admin, install, settlement};

#[no_mangle]
pub extern "C" fn pay() {
    settlement::execute_pay();
}

#[no_mangle]
pub extern "C" fn set_paused() {
    admin::execute_set_paused();
}

#[no_mangle]
pub extern "C" fn set_treasury() {
    admin::execute_set_treasury();
}

#[no_mangle]
pub extern "C" fn set_admin() {
    admin::execute_set_admin();
}

#[no_mangle]
pub extern "C" fn get_payment_count() {
    settlement::execute_get_payment_count();
}

#[no_mangle]
pub extern "C" fn call() {
    install::execute_call();
}
