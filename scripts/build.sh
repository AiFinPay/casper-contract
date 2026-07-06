#!/usr/bin/env bash
# Build the AiFinPay Casper contract to WebAssembly (release).
set -euo pipefail
cd "$(dirname "$0")/.."
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
echo "✅ Wasm: target/wasm32-unknown-unknown/release/aifinpay_casper.wasm"
