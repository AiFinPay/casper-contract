# Deployment Guide — AiFinPay × Casper v2

> **Release gate:** existing v1 testnet/mainnet hashes are quarantined. A new
> deployment is not trusted until its Wasm hash, source commit, deploy result,
> contract hash and independent verification are committed to
> `deployments/casper-v2.json` with `status: verified`.

## Prerequisites

```bash
# The CI/release toolchain is intentionally pinned.
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup toolchain install nightly-2025-02-04 --profile minimal
rustup target add wasm32-unknown-unknown --toolchain nightly-2025-02-04

# Node.js 24+
node --version

# Install demo dependencies
cd demo && npm ci
```

## Step 1 — Build the Wasm

```bash
cd aifinpay-casper/
cargo +nightly-2025-02-04 build --release --locked --target wasm32-unknown-unknown
sha256sum target/wasm32-unknown-unknown/release/aifinpay_casper.wasm
```

Output: `target/wasm32-unknown-unknown/release/aifinpay_casper.wasm` (~55KB)

## Step 2 — Generate Keypair

```bash
cd demo/
node keygen.js
```

Generate two separately controlled and funded accounts. Each agent may only
register the account that signed the deploy. Never use one key for buyer and
provider. Key generation creates:
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

Deployment alone does not enable payment traffic. Record the final successful
deploy hash, contract hash, exact Wasm SHA-256, 40-character source commit and
UTC deployment time in `deployments/casper-v2.json`. Independently query
`info_get_deploy`, compare the installed Wasm/source build, then add
`verifiedAt` and change `status` to `verified` in a reviewed commit.

## Step 5 — Run Demo Flow

```bash
node demo.js
```

Set `PROVIDER_KEYS_DIR` to the separately funded provider key. This will:
1. Register `aifinpay-agent-001` on-chain
2. Have the provider self-register `aifinpay-agent-002`
3. Atomically transfer and record 2.5 CSPR (`req-001`)
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
| RPC (public, no auth) | https://node.testnet.casper.network/rpc |
| RPC (alt, needs Authorization header) | https://node.testnet.cspr.cloud/rpc |
| Block Explorer | https://testnet.cspr.live |
| Faucet | https://testnet.cspr.live/tools/faucet |

> Note: the old `rpc.testnet.casperlabs.io:7777` node is no longer reachable.
> Use `node.testnet.casper.network/rpc` (public, CORS-friendly). The browser
> dashboard needs a CORS-enabled RPC — if blocked, use a cspr.cloud key.

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

**Payments are quarantined** — this is expected until the v2 manifest is
complete, independently verified and committed. `CONTRACT_HASH` cannot bypass
the gate.

**Contract hash not in named keys** — inspect the successful deploy/account
state directly. Do not rerun the deploy script blindly because it creates a new
contract.

## Production sign-off

Before changing the manifest to `verified`, all of the following must be true:

- blocking CI succeeded for the exact source commit and its uploaded Wasm;
- the artifact SHA-256 equals `wasmSha256` in the manifest;
- `info_get_deploy` reports success on the expected chain;
- `contractHash` belongs to that install deploy and exposes the v2 entry points;
- buyer and provider use distinct accounts and self-registration was tested;
- zero amount, forged payer, duplicate request, self-payment and malformed ID
  calls revert; a valid payment changes recipient balance by the exact amount;
- bridge regression tests pass and the SDK/MCP address comes from the reviewed
  manifest.
