#!/usr/bin/env bash
# Run the headline agentic demo: AI agent buys compute, settled on Casper.
set -euo pipefail
cd "$(dirname "$0")/../demo"
[ -d node_modules ] || npm install
node agent-compute-demo.js
