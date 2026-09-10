#!/usr/bin/env bash
# Generate a testnet keypair.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d demo/node_modules ] || (cd demo && npm install)
node scripts/keygen.js
