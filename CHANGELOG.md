# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
