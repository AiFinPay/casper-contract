# AiFinPay × Casper — Buildathon Submission

> **AiFinPay = payment infrastructure for autonomous AI agents and
> machine-to-machine commerce. Casper is the on-chain settlement layer.**

Built for the **Casper Agentic Buildathon**.

---

## The problem

Autonomous AI agents increasingly need to pay each other and pay for
services (compute, data, APIs) without a human in the loop. That needs three
things: an agent **identity**, a **payment protocol**, and a verifiable
**settlement record**. AiFinPay provides the protocol (x402); Casper provides
the settlement layer.

## What we built

1. **A live Casper settlement contract** (Rust → Wasm, `casper-test`) — a
   registry where AI agents register an on-chain identity and settle payments.
   Every settlement is recorded and emits a `PaymentSettled` event.
   - Entry points: `register_agent(agent_id, wallet)`,
     `pay_agent(from_agent, to_agent, amount, request_id)`, `get_payment_count()`.
   - Idempotent settlements (duplicate `request_id` rejected), both parties must
     be registered.
2. **An end-to-end agentic payment flow** — an autonomous AI agent buys LLM
   compute and settles the payment on Casper via HTTP 402 (x402):
   - `agent-compute-demo.js` (the agent) + `compute-bridge.js` (the x402 gate).
   - The agent is driven by **Claude** (via Claude Code / the AiFinPay MCP
     server) in the demo.

## How it works

```
AI agent (Claude)            x402 compute bridge             Casper contract
     │                              │                              │
     │── register_agent ───────────────────────────────────────► (on-chain id)
     │── POST /infer ──────────────►│                              │
     │◄── HTTP 402 pay_casper ──────│  (contract, amount, req_id)  │
     │── pay_agent(from,to,amt,req) ───────────────────────────► (REAL tx)
     │                              │── verify deploy on Casper ──►│
     │◄── compute result ───────────│  (only after settlement)     │
```

x402 is the payment-request protocol; the **settlement is a real Casper
transaction**, verified on-chain by the bridge before the compute is released.

## On-chain proof (Casper testnet)

- **Contract:** `hash-47df409829ddf0612617460293ba591a19b26fa0c06918878204088d3eb9b78a`
- **Explorer:** https://testnet.cspr.live/contract/47df409829ddf0612617460293ba591a19b26fa0c06918878204088d3eb9b78a
- **Network:** `casper-test` (Casper 2.0) · **Public RPC:** `https://node.testnet.casper.network/rpc`
- **Settlement transactions (from the agent-compute demo):**
  - register (buyer):   `https://testnet.cspr.live/deploy/<FILL_AFTER_RUN>`
  - register (provider):`https://testnet.cspr.live/deploy/<FILL_AFTER_RUN>`
  - **PaymentSettled:**  `https://testnet.cspr.live/deploy/<FILL_AFTER_RUN>`

> Fill the three links by running `node demo/agent-compute-demo.js` with a
> funded testnet key — it prints every explorer link.

## Tech stack

- **Contract:** Rust → Wasm (`casper-contract 5.1.1`, `casper-types 6.1.0`)
- **Agent + bridge:** Node.js (`casper-js-sdk 2.15.4`), built-in HTTP, no extra deps
- **Dashboard:** vanilla HTML/JS reading Casper RPC directly
- **Protocol:** AiFinPay x402 (HTTP 402 payment-required + on-chain settlement)

## Why Casper

Casper gives agentic workloads a low-fee, immutable settlement record with a
clean account/identity model. The settlement contract is intentionally minimal
(record + event), in line with Casper 2.x — value moves by native transfer while
the contract provides the verifiable agent identity and settlement registry.

## Links

- **Repo:** https://github.com/AiFinPay/aifinpay-casper
- **Demo video:** _<FILL>_  · **Run guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **AiFinPay:** multi-chain payment infrastructure for AI agents (Solana, Polygon, Avalanche, BOT Chain, Casper, Sui).

## What's next

- Route real compute providers (Venice / io.net) through the Casper-settled bridge.
- Wire Casper into the AiFinPay SDK (`@aifinpay/agent`) as a first-class chain.
