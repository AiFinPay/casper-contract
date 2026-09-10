#!/usr/bin/env bash
# Run the headline agentic demo: AI agent buys compute, settled on Casper.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d demo/node_modules ] || (cd demo && npm install)
node demo/agent-compute-demo.js
