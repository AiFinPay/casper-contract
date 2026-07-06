# Supported Versions & Networks

## Software versions

| Version | Status      | Notes |
|---------|-------------|-------|
| 1.x     | ✅ Active   | Current line. Bug fixes + security patches. |

## Networks

| Network                    | Chain name    | Status         | Contract |
|----------------------------|---------------|----------------|----------|
| Casper Testnet             | `casper-test` | ✅ Live        | `hash-47df409829ddf0612617460293ba591a19b26fa0c06918878204088d3eb9b78a` |
| Casper Mainnet             | `casper`      | 🔜 Planned     | — |

## Toolchain

| Component        | Version           |
|------------------|-------------------|
| Rust             | stable (see `rust-toolchain.toml`) |
| Wasm target      | `wasm32-unknown-unknown` |
| casper-contract  | 5.1.1             |
| casper-types     | 6.1.0             |
| casper-js-sdk    | 2.15.4            |
| Node.js          | ≥ 18              |
| MCP SDK          | ≥ 1.29.0          |
