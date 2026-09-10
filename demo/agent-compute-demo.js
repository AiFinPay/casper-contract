/**
 * agent-compute-demo.js — the AiFinPay x Casper buildathon demo.
 *
 * An autonomous AI agent buys LLM compute and SETTLES THE PAYMENT ON CASPER:
 *
 *   1. agent registers; provider is pre-registered by its own wallet
 *   2. agent asks the bridge for compute         → HTTP 402 (pay_casper)
 *   3. agent settles on Casper                    → pay_agent  (REAL testnet tx)
 *   4. bridge verifies the settlement on-chain    → returns the compute result
 *
 * Narrative: AiFinPay = the x402 payment protocol layer. Casper = the on-chain
 * settlement backend for autonomous agent-to-agent payments. In the demo video
 * this agent is driven by Claude (via Claude Code / the AiFinPay MCP server) —
 * "Claude pays for compute, settled on Casper."
 *
 * One command: `node agent-compute-demo.js` (spawns the bridge itself).
 * Two-terminal mode: start `node compute-bridge.js` separately and set
 * BRIDGE_URL=http://127.0.0.1:4055.
 *
 * Prereqs: node keygen.js → fund at testnet faucet → CONTRACT_HASH in .env.
 */

require('dotenv').config();
const { CasperClient, Keys, CLValueBuilder, RuntimeArgs } = require('casper-js-sdk');
const { spawn } = require('child_process');
const path = require('path');
const { assertTrustedContract } = require('./trusted-contract');
const { loadConfig } = require('../lib/config');
const { callEntry, waitForSuccess, explorer } = require('../lib/casper-helpers');

const cfg = loadConfig(__dirname, { requireContract: true, requireProvider: true });
const PROMPT =
  process.env.PROMPT ||
  'In one sentence: why does autonomous agent-to-agent commerce need an on-chain settlement layer?';

assertTrustedContract(cfg.contractHash);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Bridge spawn (one-command mode) ───────────────────────────────────────────
function startBridge(providerAgentId) {
  if (process.env.BRIDGE_URL) return { url: process.env.BRIDGE_URL, child: null };
  const child = spawn(process.execPath, [path.join(__dirname, 'compute-bridge.js')], {
    env: {
      ...process.env,
      BRIDGE_PORT: String(cfg.bridgePort),
      CONTRACT_HASH: cfg.contractHash,
      NODE_URL: cfg.nodeUrl,
      NETWORK_NAME: cfg.network,
      PROVIDER_AGENT_ID: providerAgentId,
      PRICE_MOTES: cfg.priceMotes,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`   ${String(d).trimEnd()}\n`));
  child.stderr.on('data', (d) => process.stderr.write(`   ${String(d).trimEnd()}\n`));
  return { url: `http://127.0.0.1:${cfg.bridgePort}`, child };
}

async function waitForBridge(url) {
  for (let i = 0; i < 25; i++) {
    try {
      const r = await fetch(`${url}/`);
      if (r.ok) return;
    } catch {
      /* process may have already exited */
    }
    await sleep(200);
  }
  throw new Error(`bridge did not come up at ${url}`);
}

// ── Main flow ─────────────────────────────────────────────────────────────────
async function main() {
  const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(path.join(cfg.keysDir, 'secret_key.pem'));
  const accountHash = keypair.publicKey.toAccountHashStr();
  const client = new CasperClient(cfg.nodeUrl);

  const nonce = Date.now().toString(36);
  const BUYER = `aifinpay-buyer-${nonce}`;

  console.log('🤖 AiFinPay × Casper — AI agent pays for compute, settled on Casper');
  console.log('====================================================================');
  console.log('Contract:', cfg.contractHash);
  console.log('Caller:  ', accountHash);
  console.log('Buyer:   ', BUYER, '| Provider:', cfg.providerAgent);
  console.log('');

  const { url: BRIDGE_URL, child } = startBridge(cfg.providerAgent);
  const cleanup = () => {
    if (child)
      try {
        child.kill('SIGKILL');
      } catch {
        /* bridge not ready yet */
      }
  };

  try {
    await waitForBridge(BRIDGE_URL);

    // ── 1. Register the payer. The merchant must self-register separately. ───
    console.log('📝 Step 1: Registering buyer on Casper...');
    const r1 = await callEntry(
      client,
      keypair,
      cfg.contractHash,
      cfg.network,
      'register_agent',
      RuntimeArgs.fromMap({
        agent_id: CLValueBuilder.string(BUYER),
        wallet: CLValueBuilder.string(accountHash),
      })
    );
    console.log('   buyer    register tx:', r1, '→', explorer(r1));
    await waitForSuccess(cfg.nodeUrl, r1, 'register buyer');
    console.log('   ✅ buyer registered; provider is pre-registered by its own wallet\n');

    // ── 2. Ask the bridge for compute → expect HTTP 402 ───────────────────────
    console.log('💡 Step 2: Agent requests compute →', JSON.stringify(PROMPT));
    let resp = await fetch(`${BRIDGE_URL}/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-id': BUYER },
      body: JSON.stringify({ agent_id: BUYER, prompt: PROMPT }),
    });
    if (resp.status !== 402)
      throw new Error(`expected 402, got ${resp.status}: ${await resp.text()}`);
    const challenge = await resp.json();
    const pc = challenge.pay_casper;
    console.log('   ← HTTP 402 Payment Required (settle on Casper)');
    console.log(
      '     request_id:',
      pc.request_id,
      '| amount:',
      pc.amount_motes,
      'motes →',
      cfg.providerAgent,
      '\n'
    );

    // ── 3. Settle on Casper: pay_agent (REAL testnet tx) ──────────────────────
    console.log('💸 Step 3: Settling on Casper — pay_agent(...)');
    const pay = await callEntry(
      client,
      keypair,
      cfg.contractHash,
      cfg.network,
      'pay_agent',
      RuntimeArgs.fromMap({
        from_agent: CLValueBuilder.string(pc.from_agent),
        to_agent: CLValueBuilder.string(pc.to_agent),
        amount: CLValueBuilder.u512(pc.amount_motes),
        request_id: CLValueBuilder.string(pc.request_id),
      })
    );
    console.log('   settlement tx:', pay);
    console.log('   explorer:     ', explorer(pay));
    await waitForSuccess(cfg.nodeUrl, pay, 'pay_agent');
    console.log('   ✅ PaymentSettled on-chain\n');

    // ── 4. Retry with proof → bridge verifies on Casper → returns compute ─────
    console.log('🔁 Step 4: Retrying with settlement proof...');
    resp = await fetch(`${BRIDGE_URL}/infer`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-id': BUYER,
        'x-casper-deploy': pay,
        'x-request-id': pc.request_id,
      },
      body: JSON.stringify({ agent_id: BUYER, prompt: PROMPT }),
    });
    const out = await resp.json();
    if (!resp.ok || !out.ok)
      throw new Error(`compute call failed ${resp.status}: ${JSON.stringify(out)}`);
    console.log('   ✅ settlement verified on-chain by the bridge\n');

    console.log('🎉 ============================================================');
    console.log('   COMPUTE DELIVERED — PAID & SETTLED ON CASPER');
    console.log('============================================================');
    console.log('Compute result (', out.compute.live ? 'live provider' : 'demo mock', '):');
    console.log('   ', out.compute.output);
    console.log('');
    console.log('On-chain settlement:');
    console.log('   register buyer:   ', explorer(r1));
    console.log('   provider agent:    ', cfg.providerAgent, '(pre-registered)');
    console.log('   PaymentSettled:   ', explorer(pay));
    console.log(
      '   contract state:    https://testnet.cspr.live/contract/' +
        cfg.contractHash.replace('hash-', '')
    );
    console.log('');
    console.log('Dashboard: open demo/dashboard.html and paste the contract hash.');
  } finally {
    cleanup();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌', err.message || err);
    process.exit(1);
  });
