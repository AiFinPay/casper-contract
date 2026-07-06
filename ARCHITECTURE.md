# Architecture

AiFinPay is payment infrastructure for autonomous AI agents. This repository is
the **Casper settlement layer**: a Rust → Wasm smart contract that records
agent-to-agent payments immutably on Casper, plus the x402 bridge, SDK examples,
and MCP server that let AI agents settle on it.

> For low-level storage layout, error codes, and named keys, see
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Components

```mermaid
flowchart LR
    subgraph Client["AI Agent Runtime"]
        A[AI Agent]
        SDK[AiFinPay SDK / MCP server]
    end

    subgraph Protocol["AiFinPay x402 Protocol"]
        API[x402 Bridge / API]
    end

    subgraph Casper["Casper Blockchain"]
        SC[AiFinPay Settlement Contract]
        LEDGER[(Immutable ledger<br/>agents · payments · events)]
    end

    M[Merchant / Service]

    A --> SDK
    SDK -->|register_agent / pay_agent| API
    API -->|HTTP 402 challenge| A
    API --> SC
    SC --> LEDGER
    SC -->|PaymentSettled event| API
    API -->|verified · unlock resource| M
    M -->|deliver result| A
```

## Payment lifecycle (sequence)

```mermaid
sequenceDiagram
    autonumber
    participant Agent as AI Agent
    participant Bridge as x402 Bridge / API
    participant Casper as Casper Contract
    participant Merchant as Merchant / Service

    Agent->>Casper: register_agent(agent_id, wallet)
    Merchant->>Casper: register_agent(provider_id, wallet)
    Agent->>Bridge: request resource
    Bridge-->>Agent: HTTP 402 Payment Required (pay_casper challenge)
    Agent->>Casper: pay_agent(from, to, amount, request_id)
    Casper-->>Casper: validate agents · record payment · emit PaymentSettled
    Casper-->>Agent: tx confirmed (deploy hash)
    Agent->>Bridge: retry request (+ request_id)
    Bridge->>Casper: verify PaymentSettled(request_id)
    Casper-->>Bridge: settlement confirmed
    Bridge->>Merchant: unlock resource
    Merchant-->>Agent: deliver result
```

## Why Casper

- **Predictable, low fees** for high-frequency machine-to-machine micropayments.
- **Deterministic Wasm execution** (Rust) — auditable settlement logic.
- **Native on-chain events** (`PaymentSettled`) give merchants a cryptographic
  proof of payment without a trusted intermediary.
- **Idempotent settlement** keyed by `request_id` — safe retries, no double spend.

## Multi-chain context

Casper is one settlement backend in the broader AiFinPay protocol, which also
runs on Solana and multiple EVM networks. Each chain shares the same economic
model; Casper adds a low-fee, high-throughput option tuned for agentic workloads.
