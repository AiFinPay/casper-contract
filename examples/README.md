# Examples

Runnable, copy-paste examples for integrating with the AiFinPay × Casper
settlement layer. Each example is intentionally small and maps to a real script
in [`../demo`](../demo).

| Example | What it shows | Runs against |
|---------|---------------|--------------|
| [`register-agent.js`](register-agent.js) | Register an AI agent on-chain (`register_agent`) | `casper-test` |
| [`pay-agent.js`](pay-agent.js) | Settle a payment between two agents (`pay_agent`) | `casper-test` |
| [`ai-agent-buys-compute.md`](ai-agent-buys-compute.md) | The headline flow: agent buys compute, x402 → Casper | `casper-test` |
| [`merchant-integration.md`](merchant-integration.md) | Gate a merchant endpoint behind an on-chain settlement | any HTTP service |
| [`mcp-server.md`](mcp-server.md) | Drive Casper settlements from Claude via MCP | `casper-test` |

## Prerequisites

```bash
cd ../demo
npm install
node keygen.js          # generate a keypair
# fund it at https://testnet.cspr.live/tools/faucet, then wait ~2 min
```

The contract is already live on Casper testnet — the deployed hash and public
RPC are in [`../demo/.env.example`](../demo/.env.example). Copy it to `.env`:

```bash
cp .env.example .env
```
