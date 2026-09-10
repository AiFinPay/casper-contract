# AGENTS.md

Primary instructions: node_modules/@daochild/agents-config/AGENTS.md — read in full and follow unless overridden below.

## What this is

Casper settlement contract for AiFinPay (AI-agent payment protocol). Rust → Wasm smart contract + Node.js demo/MCP/bridge layer.

## Quick commands

```bash
make setup      # install wasm target + node deps
make build      # cargo build --release --target wasm32-unknown-unknown
make fmt        # cargo fmt --all
make clippy     # cargo clippy --all-targets -- -D warnings
make test       # cargo test
make agent-demo # run full AI-agent-buys-compute demo
make mcp        # start MCP server
```

CI order: `fmt → clippy → build → test`. All must pass.

## Architecture

- `src/` — Rust `#![no_std]` Casper contract (entry points: `pay`, `set_paused`, `set_treasury`, `set_admin`, `get_payment_count`, `call`)
- `demo/` — Node.js: x402 bridge (`compute-bridge.js`), MCP server (`casper-mcp.mjs`), dashboard, agent demo
- `lib/` — shared JS helpers for Casper RPC interaction
- `scripts/` — deploy + keygen wrappers
- `deployments/` — verified contract hash manifests (`casper-v2.json`, `casper-v3.json`)

## Key gotchas

- Rust toolchain is pinned to **nightly-2025-02-04** (`rust-toolchain.toml`). Do not upgrade without checking Casper SDK compatibility.
- Build target is `wasm32-unknown-unknown`, not native.
- Contract is `#![no_std]` + `#![no_main]` — no standard library, no println debugging.
- `make clippy` runs with `-D warnings` — any warning is a CI failure.
- `demo/.env` and `demo/keys/` are gitignored — never commit secrets. Copy `demo/.env.example` to `demo/.env`.
- `deployments/casper-v2.json` must have `status: verified` before payment routes are enabled.
- The mainnet contract (v1) is quarantined — it recorded amounts but didn't transfer. Do not reproduce v1 flow.

## Conventions

- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`
- Rust: `rustfmt` + `clippy` (4-space indent)
- JS: Prettier (single quotes, trailing commas es5) + ESLint (2-space indent)
- EditorConfig: LF line endings, UTF-8, trim trailing whitespace (except .md)

## Testing

- `make test` — Rust contract unit tests
- `cd demo && node test-mcp.mjs` — MCP server smoke test
- `cd demo && node --test test/*.test.js` — Node.js tests
- E2E: `make agent-demo` against live testnet contract, verify deploy resolves on cspr.live
