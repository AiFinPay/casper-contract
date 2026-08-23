# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-08-04

### Security
- Changed `pay_agent` from receipt-only bookkeeping to an atomic native CSPR
  transfer followed by an immutable settlement record and event.
- Bound every agent registration to `runtime::get_caller()` and authorize a
  payment only when the caller owns `from_agent`; reject zero-value,
  self-payment, malformed identifier/wallet, duplicate request and counter
  overflow cases.
- Replaced permissive bridge verification with exact, fail-closed checks of
  execution success, contract hash, entry point and all quoted payment terms.
- Added request expiry, bounded pending state, replay/in-flight protection and
  retry-safe upstream failure handling to the HTTP 402 bridge.
- Quarantined all demo/MCP payment entry points until a complete, reviewed v2
  deployment manifest has `status: verified`. Environment variables cannot
  override the trusted contract.
- Removed the legacy mainnet demo's second native transfer and require the
  provider to self-register with a distinct funded key.

### Tests
- Added 13 Node regression/negative tests for exact settlement verification,
  failed/pending deploys, malformed sessions, amount mismatches and deployment
  quarantine.
- Made Rust formatting, Clippy, locked Wasm build, artifact presence, Node
  tests and syntax checks blocking in CI; pinned third-party GitHub actions.

### Added
- World-class repository structure for the Casper Agentic Buildathon final round:
  full README with architecture (Mermaid) and payment-lifecycle diagrams, badges,
  and hero banner.
- Community health files: `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `SUPPORTED.md`, `ROADMAP.md`, issue/PR templates, `CODEOWNERS`, `FUNDING.yml`.
- CI/security automation: GitHub Actions (Rust + Node build, format, lint, test),
  CodeQL analysis, Dependabot, secret scanning.
- `examples/` with runnable agent, merchant, payment, and contract examples.
- Developer tooling: `Makefile`, `.editorconfig`, `.gitattributes`, `.prettierrc`,
  `.eslintrc.json`.

## [1.0.0] - 2026-07

### Added
- Casper settlement contract (Rust → Wasm) deployed on `casper-test`:
  `register_agent`, `pay_agent`, `get_payment_count`, with on-chain
  `AgentRegistered` / `PaymentSettled` events and idempotent settlements.
- End-to-end agentic payment demo: an autonomous AI agent buys compute and
  settles on Casper via the x402 flow (`agent-compute-demo.js`, `compute-bridge.js`).
- AiFinPay Casper MCP server (`casper-mcp.mjs`) for driving settlements from
  Claude / MCP-compatible agents.
- Live dashboard, deploy/keygen scripts, and deployment documentation.
