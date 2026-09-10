#!/usr/bin/env bash
# Deploy the contract to Casper testnet.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d demo/node_modules ] || (cd demo && npm install)
node scripts/deploy.js
