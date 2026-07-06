# Example: AI agent buys compute, settled on Casper

This is the headline AiFinPay flow — an **autonomous AI agent buys LLM compute
and settles the payment on Casper** through the x402 challenge/response.

```bash
cd demo
npm install
node agent-compute-demo.js
```

## What happens

1. The agent and the compute provider each call `register_agent` on Casper.
2. The agent requests compute from the x402 bridge (`compute-bridge.js`).
3. The bridge replies **HTTP 402 Payment Required** with a `pay_casper` challenge.
4. The agent calls `pay_agent(...)` — a **real testnet transaction** — settling
   the micropayment on Casper.
5. The bridge verifies the `PaymentSettled` event on-chain, then returns the
   compute result.

The on-chain settlement is real whether compute is mocked or routed to a live
provider. To route to a real OpenAI-compatible provider (Venice / io.net / etc.):

```bash
export COMPUTE_UPSTREAM_URL="https://api.example.com/v1/chat/completions"
export COMPUTE_API_KEY="sk-..."
node agent-compute-demo.js
```

See [`../docs/DEMO_VIDEO.md`](../docs/DEMO_VIDEO.md) for the narrated walkthrough.
