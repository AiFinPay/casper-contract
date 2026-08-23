# Supported Versions & Networks

## Software versions

| Version | Status      | Notes |
|---------|-------------|-------|
| 2.x     | Source candidate | Payment routes stay quarantined until verified deployment. |
| 1.x     | ❌ Unsupported | Receipt-only settlement and missing caller binding. |

## Networks

| Network                    | Chain name    | Status         | Contract |
|----------------------------|---------------|----------------|----------|
| Casper Testnet             | `casper-test` | ⚠️ Legacy v1 only | Quarantined |
| Casper Mainnet             | `casper`      | ⚠️ Legacy v1 only | Quarantined |

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
