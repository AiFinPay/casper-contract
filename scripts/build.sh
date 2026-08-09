#!/usr/bin/env bash
# Build the AiFinPay Casper contract to WebAssembly (release).
set -euo pipefail
cd "$(dirname "$0")/.."
rustup toolchain install nightly-2025-02-04 --profile minimal
rustup target add wasm32-unknown-unknown --toolchain nightly-2025-02-04
cargo +nightly-2025-02-04 build --workspace --release --locked --target wasm32-unknown-unknown
sha256sum \
  target/wasm32-unknown-unknown/release/aifinpay_casper.wasm \
  target/wasm32-unknown-unknown/release/aifinpay_casper_pay_session.wasm
