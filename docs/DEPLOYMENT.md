# Deployment Guide — AiFinPay × Casper

## Prerequisites

```bash
# Rust + wasm32 target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Node.js 18+
node --version

# Install demo dependencies
cd demo && npm install
```

## Step 1 — Build the Wasm

```bash
cd aifinpay-casper/
cargo build --release
```

Output: `target/wasm32-unknown-unknown/release/aifinpay_casper.wasm` (~55KB)

## Step 2 — Generate Keypair

```bash
cd demo/
node keygen.js
```

This creates:
- `keys/secret_key.pem` — private key (keep secret, never commit)
- `keys/public_key.pem` — public key
- `keys/public_key_hex.txt` — hex public key

## Step 3 — Fund Testnet Account

1. Go to: https://testnet.cspr.live/tools/faucet
2. Paste the **account hash** printed by `keygen.js`
3. Click "Request tokens"
4. Wait ~2 minutes
5. Verify balance: https://testnet.cspr.live/

You need ~250 CSPR total:
- ~200 CSPR for contract deployment gas
- ~50 CSPR for demo calls (3 × ~5 CSPR each)

## Step 4 — Deploy Contract

```bash
# Copy .env.example to .env
cp .env.example .env

# Deploy
node deploy.js
```

On success, you'll see:
```
🎉 CONTRACT DEPLOYED ON CASPER TESTNET
Contract hash: hash-xxxxxxxx...
Explorer:      https://testnet.cspr.live/contract/xxxxxxxx...
```

The contract hash is auto-appended to `.env`.

## Step 5 — Run Demo Flow

```bash
node demo.js
```

This will:
1. Register `aifinpay-agent-001` on-chain
2. Register `aifinpay-agent-002` on-chain
3. Settle a payment (2.5 CSPR, request ID: `req-001`)
4. Print all transaction hashes + explorer links

## Step 6 — Verify On-Chain

Check the transaction hashes on the Casper testnet explorer:
- https://testnet.cspr.live/deploy/HASH

Check contract state:
- https://testnet.cspr.live/contract/CONTRACT_HASH

## Step 7 — Open Dashboard

Open `demo/dashboard.html` in your browser (no server needed).  
Paste the contract hash → click Connect → live data loads from Casper RPC.

---

## Testnet RPC Endpoints

| Endpoint | URL |
|---|---|
| RPC | http://rpc.testnet.casperlabs.io:7777 |
| Block Explorer | https://testnet.cspr.live |
| Faucet | https://testnet.cspr.live/tools/faucet |
| REST API | http://rest.testnet.casperlabs.io:8888 |

## Network Info

| Property | Value |
|---|---|
| Network name | `casper-test` |
| Native token | CSPR |
| 1 CSPR | 1,000,000,000 motes |

## Troubleshooting

**"Account not found"** — Account needs to be on-chain first. Fund via faucet and wait 2 minutes.

**"Deploy timed out"** — Testnet can be slow. Retry or check explorer manually.

**"Wasm not found"** — Run `cargo build --release` from the root directory first.

**Contract hash not in named keys** — Wait 30s after deploy hash confirms, then re-run `node deploy.js` (it won't re-deploy, just fetches the hash).
