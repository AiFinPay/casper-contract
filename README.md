> ⚠️ **USED FOR CASPER AGENTIC BUILDATHON — NOT FOR PRODUCTION.** This repository is kept as the public record for the CASPER AGENTIC BUILDATHON submission. The contract code here may duplicate the canonical `evm-contract` repo and is **unmaintained** — do not use in production.

# AiFinPay × Casper — Agent Settlement Layer

> Payment infrastructure for autonomous AI agents and machine-to-machine commerce on Casper.

Built for the **Casper Agentic Buildathon** — $30K prize pool.

---

## What This Is

A minimal, working Casper smart contract that acts as a **settlement registry** for AI agent payments. Any AI agent can register on-chain, then settle payments with other agents. Every settlement emits a `PaymentSettled` event recorded permanently on the Casper blockchain.

**Main narrative:** AiFinPay = the x402 payment protocol layer. Casper = the settlement backend for agent-to-agent payments.

---

## Contract

**Language:** Rust → WebAssembly  
**Testnet:** Casper Testnet (`casper-test`)  
**Contract hash:** _Set after deployment_

### Entry Points

| Entry Point | Args | Description |
|---|---|---|
| `register_agent` | `agent_id: String, wallet: String` | Register an AI agent on-chain |
| `pay_agent` | `from_agent: String, to_agent: String, amount: U512, request_id: String` | Settle a payment + emit `PaymentSettled` |
| `get_payment_count` | — | Returns total settled payments |

### Events (stored on-chain)
- `AgentRegistered` — agent_id, wallet
- `PaymentSettled` — from, to, amount (motes), request_id

### Storage
- `agents` dictionary — agent_id → wallet
- `payments` dictionary — request_id → settlement record
- `events` dictionary — evt_0, evt_1, ... → event JSON

---

## Quick Start

### 1. Build the contract

```bash
# Requires Rust + wasm32 target
rustup target add wasm32-unknown-unknown
cargo build --release
# Output: target/wasm32-unknown-unknown/release/aifinpay_casper.wasm
```

### 2. Generate keypair

```bash
cd demo && npm install
node keygen.js
```

### 3. Fund account

Go to https://testnet.cspr.live/tools/faucet and paste your account hash.  
Wait ~2 minutes for tokens to arrive.

### 4. Deploy contract

```bash
node deploy.js
# Outputs: CONTRACT_HASH — save this to .env
```

### 5. Run demo flow

```bash
# Registers 2 agents + settles a payment on-chain
node demo.js
```

### 6. Open dashboard

Open `demo/dashboard.html` in your browser. Paste the contract hash to connect live.

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Deployment Guide

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Tech Stack

- **Smart contract:** Rust → Wasm (`casper-contract 5.1.1`, `casper-types 6.1.0`)
- **Demo scripts:** Node.js (`casper-js-sdk 2.15.4`)
- **Dashboard:** Vanilla HTML/JS — queries Casper RPC directly
- **Network:** Casper Testnet

---

## AiFinPay Protocol

This Casper contract is part of the AiFinPay multi-chain protocol:

| Chain | Status |
|---|---|
| Solana | ✅ Mainnet live |
| Polygon | ✅ Mainnet live |
| Casper | 🔨 Testnet (this repo) |
| Base / Arbitrum / BNB | 🔜 Ready to deploy |

GitHub: https://github.com/AiFinPay
