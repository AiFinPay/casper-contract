#!/usr/bin/env bash
# Deploy the contract to Casper testnet via the Node deploy script.
set -euo pipefail
cd "$(dirname "$0")/../demo"
[ -d node_modules ] || npm install
node deploy.js
