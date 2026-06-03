# AiFinPay × Casper — Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     AI AGENT LAYER                          │
│   Agent-001          Agent-002          Agent-003           │
│  (Casper wallet)    (Casper wallet)    (Casper wallet)       │
└────────┬────────────────┬────────────────┬──────────────────┘
         │                │                │
         │  register_agent()    pay_agent() │
         ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│              AIFINPAY CASPER SETTLEMENT CONTRACT            │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   agents{}  │  │  payments{}  │  │    events{}      │   │
│  │ agent_id →  │  │ request_id → │  │ evt_0, evt_1 ... │   │
│  │   wallet    │  │   record     │  │ PaymentSettled   │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│                                                             │
│  Entry Points:                                              │
│  • register_agent(agent_id, wallet)                         │
│  • pay_agent(from, to, amount, request_id)                  │
│  • get_payment_count()                                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   CASPER BLOCKCHAIN                         │
│              (immutable settlement record)                  │
└─────────────────────────────────────────────────────────────┘
```

## Payment Flow

```
AI Agent A                AiFinPay Contract            Casper Node
    │                           │                           │
    │── register_agent() ──────►│                           │
    │                           │── store in agents dict ──►│
    │                           │                           │
AI Agent B                      │                           │
    │── register_agent() ──────►│                           │
    │                           │── store in agents dict ──►│
    │                           │                           │
AI Agent A                      │                           │
    │── pay_agent(A→B, 2.5CSPR, req-001) ─────────────────►│
    │                           │── validate both agents    │
    │                           │── record in payments dict │
    │                           │── emit PaymentSettled     │
    │                           │── increment counter       │
    │◄── tx confirmed ──────────────────────────────────────│
```

## Storage Layout

| Named Key | Type | Description |
|---|---|---|
| `agents` | Dictionary | agent_id (String) → wallet (String) |
| `payments` | Dictionary | request_id (String) → payment record (JSON String) |
| `events` | Dictionary | evt_N (String) → event JSON (String) |
| `payment_count` | URef → u64 | Total settled payments |
| `event_count` | URef → u64 | Total emitted events |

## Error Codes

| Code | Meaning |
|---|---|
| User(1) | Missing named key |
| User(100) | Agent already registered |
| User(101) | Agent not found |
| User(102) | Request ID already settled |

## AiFinPay x402 Integration

The Casper contract serves as the **settlement layer** for the AiFinPay x402 protocol:

1. AI agent hits AiFinPay API → gets payment challenge (x402)
2. Agent registers on Casper → gets permanent on-chain identity
3. Agent calls `pay_agent()` → settlement recorded on Casper blockchain
4. AiFinPay x402 gate verifies settlement → grants resource access
5. `PaymentSettled` event = cryptographic proof of payment

## Multi-Chain Context

AiFinPay runs on multiple chains simultaneously:
- **Solana:** Anchor/Rust program — mSECCO credits, Pyth oracle pricing
- **Polygon:** Solidity/EVM — B2B splitter, Agent Passport NFT
- **Casper:** This contract — agent settlement registry, M2M payments

Each chain serves different use cases. Casper adds a high-throughput, low-fee settlement option for agentic workloads.
