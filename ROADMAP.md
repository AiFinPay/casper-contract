# Roadmap

AiFinPay is payment infrastructure for autonomous AI agents. This repository is
the **Casper settlement layer**. The roadmap below reflects the Casper track;
items marked _Planned_ are not yet shipped.

## ✅ Shipped (Buildathon MVP)

- Casper settlement contract live on `casper-test` (`register_agent`,
  `pay_agent`, `get_payment_count`) with on-chain events and idempotent settlements.
- End-to-end agentic payment flow: AI agent buys compute → HTTP 402 → `pay_agent`
  (real testnet tx) → on-chain verification → compute delivered.
- Casper MCP server so Claude / MCP agents can settle on Casper directly.
- Live dashboard + verifiable on-chain sample transactions.

## 🔜 Near term (0–3 months)

- Native stablecoin settlement (USDC on Casper) alongside native CSPR.
- Typed SDK package (`@aifinpay/casper`) published to npm.
- Agent identity/passport parity with the AiFinPay EVM/Solana `AgentPassport`.
- Hosted x402 settlement gateway (reference API) with OpenAPI spec.

## 🧭 Mid term (3–9 months)

- Casper Mainnet deployment with a multisig-governed treasury.
- Programmable spend limits and policy enforcement at the contract level.
- Agent reputation records (verifiable payer/seller history) queryable on-chain.

## 🌐 Long term (9+ months)

- Cross-chain settlement routing between Casper and AiFinPay's other live
  networks (Solana, Polygon, and EVM chains).
- Agent-to-agent marketplace settling natively on Casper.

See the multi-chain context in [ARCHITECTURE.md](ARCHITECTURE.md).
