use alloc::format;

use crate::{
    constants::{KEY_EVENTS, KEY_EVENT_COUNT},
    storage::{checked_increment, get_uref, read_u64, write_u64},
};

pub fn emit_event(event_type: &str, payload: &str) {
    let seed = get_uref(KEY_EVENTS);
    let idx = read_u64(KEY_EVENT_COUNT);
    casper_contract::contract_api::storage::dictionary_put(
        seed,
        &format!("evt_{}", idx),
        format!("{{\"type\":\"{}\",\"payload\":{}}}", event_type, payload),
    );
    write_u64(KEY_EVENT_COUNT, checked_increment(idx));
}
