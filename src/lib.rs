#![cfg_attr(target_arch = "wasm32", no_std)]

extern crate alloc;

pub mod types;

#[cfg(target_arch = "wasm32")]
pub mod contract;
#[cfg(target_arch = "wasm32")]
pub mod entry_points;
#[cfg(target_arch = "wasm32")]
pub mod storage;
#[cfg(target_arch = "wasm32")]
pub mod validation;

#[cfg(test)]
mod test;
