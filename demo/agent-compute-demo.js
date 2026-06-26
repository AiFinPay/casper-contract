/**
 * agent-compute-demo.js — the AiFinPay x Casper buildathon demo.
 *
 * An autonomous AI agent buys LLM compute and SETTLES THE PAYMENT ON CASPER:
 *
 *   1. agent + provider register on-chain        (register_agent)
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
const { CasperClient, DeployUtil, Keys, CLValueBuilder, RuntimeArgs } = require('casper-js-sdk');
const { spawn } = require('child_process');
const path = require('path');

const NODE_URL      = process.env.NODE_URL       || 'https://node.testnet.casper.network/rpc';
const NETWORK       = process.env.NETWORK_NAME   || 'casper-test';
const KEYS_DIR      = process.env.KEYS_DIR       || path.join(__dirname, 'keys');
const CONTRACT_HASH = process.env.CONTRACT_HASH;
const BRIDGE_PORT   = parseInt(process.env.BRIDGE_PORT || '4055', 10);
const PRICE_MOTES   = process.env.PRICE_MOTES    || '100000000'; // 0.1 CSPR / call

const GAS_CALL = '5000000000'; // 5 CSPR per entry-point call
const PROMPT = process.env.PROMPT ||
  'In one sentence: why does autonomous agent-to-agent commerce need an on-chain settlement layer?';

if (!CONTRACT_HASH) {
  console.error('❌ CONTRACT_HASH not set in .env — run `node deploy.js` first.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Casper helpers (same pattern as demo.js) ──────────────────────────────────
async function callEntry(client, keypair, entryPoint, args) {
  const hashBytes = Buffer.from(CONTRACT_HASH.replace('hash-', ''), 'hex');
  const deployParams = new DeployUtil.DeployParams(keypair.publicKey, NETWORK, 1, 1800000);
  const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(hashBytes, entryPoint, args);
  const payment = DeployUtil.standardPayment(GAS_CALL);
  const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
  const signed = client.signDeploy(deploy, keypair);
  return client.putDeploy(signed);
}

// Casper 2.0 execution status via raw info_get_deploy. The 2.0 node returns
// `execution_info.execution_result.Version2` (error_message null = success);
// casper-js-sdk 2.15.4's getDeploy still parses the legacy `execution_results`
// array, which is empty on a 2.0 node — so we read the RPC directly.
async function deployState(deployHash) {
  const r = await fetch(NODE_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'info_get_deploy', params: { deploy_hash: deployHash } }),
  });
  const j = await r.json();
  const er = j && j.result && j.result.execution_info && j.result.execution_info.execution_result;
  if (!er) return { state: 'pending' };
  if (er.Version2) return er.Version2.error_message ? { state: 'failed', error: er.Version2.error_message } : { state: 'success' };
  if (er.Version1) return er.Version1.Failure ? { state: 'failed', error: (er.Version1.Failure.error_message || 'unknown') } : { state: 'success' };
  return { state: 'pending' };
}

async function waitForSuccess(_client, deployHash, label, maxWait = 180000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const s = await deployState(deployHash);
      if (s.state === 'success') return;
      if (s.state === 'failed') throw new Error(`${label} failed on-chain: ${s.error}`);
    } catch (e) {
      if (/failed on-chain/.test(e.message)) throw e;
    }
    await sleep(3000);
  }
  throw new Error(`${label} timed out (${deployHash})`);
}

function explorer(h) { return `https://testnet.cspr.live/deploy/${h}`; }

// ── Bridge spawn (one-command mode) ───────────────────────────────────────────
function startBridge(providerAgentId) {
  if (process.env.BRIDGE_URL) return { url: process.env.BRIDGE_URL, child: null };
  const child = spawn(process.execPath, [path.join(__dirname, 'compute-bridge.js')], {
    env: {
      ...process.env,
      BRIDGE_PORT: String(BRIDGE_PORT),
      CONTRACT_HASH,
      NODE_URL,
      NETWORK_NAME: NETWORK,
      PROVIDER_AGENT_ID: providerAgentId,
      PRICE_MOTES,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`   ${String(d).trimEnd()}\n`));
  child.stderr.on('data', (d) => process.stderr.write(`   ${String(d).trimEnd()}\n`));
  return { url: `http://127.0.0.1:${BRIDGE_PORT}`, child };
}

async function waitForBridge(url) {
  for (let i = 0; i < 25; i++) {
    try { const r = await fetch(`${url}/`); if (r.ok) return; } catch {}
    await sleep(200);
  }
  throw new Error(`bridge did not come up at ${url}`);
}

// ── Main flow ─────────────────────────────────────────────────────────────────
async function main() {
  const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(path.join(KEYS_DIR, 'secret_key.pem'));
  const accountHash = keypair.publicKey.toAccountHashStr();
  const client = new CasperClient(NODE_URL);

  const nonce = Date.now().toString(36);
  const BUYER = `aifinpay-buyer-${nonce}`;
  const PROVIDER = `aifinpay-provider-${nonce}`;

  console.log('🤖 AiFinPay × Casper — AI agent pays for compute, settled on Casper');
  console.log('====================================================================');
  console.log('Contract:', CONTRACT_HASH);
  console.log('Caller:  ', accountHash);
  console.log('Buyer:   ', BUYER, '| Provider:', PROVIDER);
  console.log('');

  const { url: BRIDGE_URL, child } = startBridge(PROVIDER);
  const cleanup = () => { if (child) try { child.kill('SIGKILL'); } catch {} };

  try {
    await waitForBridge(BRIDGE_URL);

    // ── 1. Register both agents on-chain ──────────────────────────────────────
    console.log('📝 Step 1: Registering agents on Casper...');
    const r1 = await callEntry(client, keypair, 'register_agent', RuntimeArgs.fromMap({
      agent_id: CLValueBuilder.string(BUYER), wallet: CLValueBuilder.string(accountHash),
    }));
    console.log('   buyer    register tx:', r1, '→', explorer(r1));
    await waitForSuccess(client, r1, 'register buyer');
    const r2 = await callEntry(client, keypair, 'register_agent', RuntimeArgs.fromMap({
      agent_id: CLValueBuilder.string(PROVIDER), wallet: CLValueBuilder.string(accountHash),
    }));
    console.log('   provider register tx:', r2, '→', explorer(r2));
    await waitForSuccess(client, r2, 'register provider');
    console.log('   ✅ both agents registered\n');

    // ── 2. Ask the bridge for compute → expect HTTP 402 ───────────────────────
    console.log('💡 Step 2: Agent requests compute →', JSON.stringify(PROMPT));
    let resp = await fetch(`${BRIDGE_URL}/infer`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-id': BUYER },
      body: JSON.stringify({ agent_id: BUYER, prompt: PROMPT }),
    });
    if (resp.status !== 402) throw new Error(`expected 402, got ${resp.status}: ${await resp.text()}`);
    const challenge = await resp.json();
    const pc = challenge.pay_casper;
    console.log('   ← HTTP 402 Payment Required (settle on Casper)');
    console.log('     request_id:', pc.request_id, '| amount:', pc.amount_motes, 'motes →', PROVIDER, '\n');

    // ── 3. Settle on Casper: pay_agent (REAL testnet tx) ──────────────────────
    console.log('💸 Step 3: Settling on Casper — pay_agent(...)');
    const pay = await callEntry(client, keypair, 'pay_agent', RuntimeArgs.fromMap({
      from_agent: CLValueBuilder.string(pc.from_agent),
      to_agent:   CLValueBuilder.string(pc.to_agent),
      amount:     CLValueBuilder.u512(pc.amount_motes),
      request_id: CLValueBuilder.string(pc.request_id),
    }));
    console.log('   settlement tx:', pay);
    console.log('   explorer:     ', explorer(pay));
    await waitForSuccess(client, pay, 'pay_agent');
    console.log('   ✅ PaymentSettled on-chain\n');

    // ── 4. Retry with proof → bridge verifies on Casper → returns compute ─────
    console.log('🔁 Step 4: Retrying with settlement proof...');
    resp = await fetch(`${BRIDGE_URL}/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-id': BUYER, 'x-casper-deploy': pay, 'x-request-id': pc.request_id },
      body: JSON.stringify({ agent_id: BUYER, prompt: PROMPT }),
    });
    const out = await resp.json();
    if (!resp.ok || !out.ok) throw new Error(`compute call failed ${resp.status}: ${JSON.stringify(out)}`);
    console.log('   ✅ settlement verified on-chain by the bridge\n');

    console.log('🎉 ============================================================');
    console.log('   COMPUTE DELIVERED — PAID & SETTLED ON CASPER');
    console.log('============================================================');
    console.log('Compute result (', out.compute.live ? 'live provider' : 'demo mock', '):');
    console.log('   ', out.compute.output);
    console.log('');
    console.log('On-chain settlement:');
    console.log('   register buyer:   ', explorer(r1));
    console.log('   register provider:', explorer(r2));
    console.log('   PaymentSettled:   ', explorer(pay));
    console.log('   contract state:    https://testnet.cspr.live/contract/' + CONTRACT_HASH.replace('hash-', ''));
    console.log('');
    console.log('Dashboard: open demo/dashboard.html and paste the contract hash.');
  } finally {
    cleanup();
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error('❌', err.message || err); process.exit(1); });
