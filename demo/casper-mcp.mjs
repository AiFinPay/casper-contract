#!/usr/bin/env node
/**
 * casper-mcp.mjs — AiFinPay × Casper MCP server.
 *
 * Gives an LLM (Claude Desktop / Claude Code) three tools so it can act as an
 * autonomous agent that BUYS COMPUTE and SETTLES THE PAYMENT ON CASPER:
 *
 *   request_compute(prompt)        -> x402 "402 Payment Required" (pay on Casper)
 *   settle_on_casper(request_id)   -> signs pay_agent  (REAL Casper testnet tx)
 *   get_compute_result(request_id) -> verifies on-chain, returns the LLM output
 *
 * The server holds the funded testnet key and signs the Casper deploys, so in
 * Claude Desktop you literally watch the model call `settle_on_casper` and a
 * real Casper transaction appear on the explorer. Same contract and the same
 * real on-chain settlement as the CLI demo — just driven by the agent itself.
 *
 * stdio MCP server: stdout belongs to the transport; ALL logs go to stderr.
 *
 *   node casper-mcp.mjs           (usually launched by Claude Desktop, not by hand)
 *
 * Config (demo/.env): CONTRACT_HASH (required), NODE_URL, NETWORK_NAME, KEYS_DIR,
 * PRICE_MOTES, and optional COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY for a real
 * LLM answer instead of the labelled demo mock.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import casper from 'casper-js-sdk';

const { CasperClient, DeployUtil, Keys, CLValueBuilder, RuntimeArgs } = casper;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const NODE_URL       = process.env.NODE_URL          || 'https://node.testnet.casper.network/rpc';
const NETWORK        = process.env.NETWORK_NAME      || 'casper-test';
// Resolve KEYS_DIR against the script dir when it's relative — Claude Desktop /
// Claude Code launch this server with an arbitrary cwd, and .env may set a
// relative KEYS_DIR (e.g. "keys"), which would otherwise break key loading.
const KEYS_DIR_RAW   = process.env.KEYS_DIR          || 'keys';
const KEYS_DIR       = path.isAbsolute(KEYS_DIR_RAW) ? KEYS_DIR_RAW : path.join(__dirname, KEYS_DIR_RAW);
const CONTRACT_HASH  = process.env.CONTRACT_HASH;
const PRICE_MOTES    = process.env.PRICE_MOTES       || '100000000'; // 0.1 CSPR / call
const GAS_CALL       = '5000000000';                                 // 5 CSPR per entry-point call
const UPSTREAM_URL   = process.env.COMPUTE_UPSTREAM_URL || '';
const UPSTREAM_KEY   = process.env.COMPUTE_API_KEY      || '';
const UPSTREAM_MODEL = process.env.COMPUTE_MODEL        || 'llama-3.3-70b';

const log = (msg) => process.stderr.write(`[casper-mcp] ${msg}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const explorer = (h) => `https://testnet.cspr.live/deploy/${h}`;
const cspr = (motes) => (Number(motes) / 1e9).toString();

if (!CONTRACT_HASH) {
  log('FATAL: CONTRACT_HASH not set in demo/.env (the deployed settlement contract).');
  process.exit(1);
}

// ── Casper plumbing (same pattern as agent-compute-demo.js) ───────────────────
const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(path.join(KEYS_DIR, 'secret_key.pem'));
const accountHash = keypair.publicKey.toAccountHashStr();
const client = new CasperClient(NODE_URL);

async function callEntry(entryPoint, args) {
  const hashBytes = Buffer.from(CONTRACT_HASH.replace('hash-', ''), 'hex');
  const deployParams = new DeployUtil.DeployParams(keypair.publicKey, NETWORK, 1, 1800000);
  const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(hashBytes, entryPoint, args);
  const payment = DeployUtil.standardPayment(GAS_CALL);
  const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
  const signed = client.signDeploy(deploy, keypair);
  return client.putDeploy(signed);
}

// Casper 2.0 execution status via raw info_get_deploy (casper-js-sdk 2.15.4
// parses the legacy execution_results, which is empty on a 2.0 node).
async function deployState(deployHash) {
  const r = await fetch(NODE_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'info_get_deploy', params: { deploy_hash: deployHash } }),
  });
  const j = await r.json();
  const er = j && j.result && j.result.execution_info && j.result.execution_info.execution_result;
  if (!er) return { state: 'pending' };
  if (er.Version2) return er.Version2.error_message ? { state: 'failed', error: er.Version2.error_message } : { state: 'success' };
  if (er.Version1) return er.Version1.Failure ? { state: 'failed', error: er.Version1.Failure.error_message || 'unknown' } : { state: 'success' };
  return { state: 'pending' };
}

async function waitForSuccess(deployHash, label, maxWait = 180000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    let s;
    try { s = await deployState(deployHash); } catch { s = { state: 'pending' }; }
    if (s.state === 'success') return;
    if (s.state === 'failed') throw new Error(`${label} failed on-chain: ${s.error}`);
    await sleep(3000);
  }
  throw new Error(`${label} timed out (${deployHash})`);
}

// ── Session state ─────────────────────────────────────────────────────────────
const SESSION  = Math.random().toString(36).slice(2, 8);
const BUYER    = `claude-agent-${SESSION}`;
const PROVIDER = `aifinpay-compute-${SESSION}`;
const orders   = new Map();   // request_id -> { from, to, amount, prompt }
const settled  = new Map();   // request_id -> deployHash
let reqSeq = 0;

// Both agents must exist on-chain before pay_agent. Register once, lazily, and
// cache the promise so concurrent/later calls reuse the same registration.
let registrationPromise = null;
function ensureRegistered() {
  if (!registrationPromise) {
    registrationPromise = (async () => {
      log(`registering agents on-chain: ${BUYER} + ${PROVIDER} (one-time, ~30-60s)...`);
      const r1 = await callEntry('register_agent', RuntimeArgs.fromMap({
        agent_id: CLValueBuilder.string(BUYER), wallet: CLValueBuilder.string(accountHash),
      }));
      await waitForSuccess(r1, 'register buyer');
      const r2 = await callEntry('register_agent', RuntimeArgs.fromMap({
        agent_id: CLValueBuilder.string(PROVIDER), wallet: CLValueBuilder.string(accountHash),
      }));
      await waitForSuccess(r2, 'register provider');
      log(`agents registered (buyer ${explorer(r1)} · provider ${explorer(r2)})`);
      return { buyer: r1, provider: r2 };
    })().catch((e) => { registrationPromise = null; throw e; });
  }
  return registrationPromise;
}

// The actual compute — real OpenAI-compatible upstream if configured, else a
// clearly-labelled demo mock so the flow runs end-to-end without extra keys.
async function runCompute(prompt) {
  if (UPSTREAM_URL && UPSTREAM_KEY) {
    const r = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${UPSTREAM_KEY}` },
      body: JSON.stringify({ model: UPSTREAM_MODEL, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json();
    const text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return { live: true, provider: UPSTREAM_URL, model: UPSTREAM_MODEL, output: text || JSON.stringify(j).slice(0, 500) };
  }
  const words = String(prompt || '').trim().split(/\s+/).filter(Boolean).length;
  return {
    live: false, provider: 'demo-mock', model: 'aifinpay-demo-llm',
    output: `[DEMO COMPUTE] Processed a ${words}-word prompt and produced an inference result. ` +
            `Set COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY for a real provider (Venice / io.net / any OpenAI-compatible API).`,
  };
}

// ── MCP tools ─────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'request_compute',
    description:
      'Request paid LLM compute from the AiFinPay provider. Returns an x402 "402 Payment Required" ' +
      'challenge that says how much to pay and that settlement happens on the Casper blockchain. ' +
      'After calling this, call settle_on_casper with the returned request_id.',
    inputSchema: {
      type: 'object',
      properties: { prompt: { type: 'string', description: 'The prompt to run once the payment settles.' } },
      required: ['prompt'],
    },
  },
  {
    name: 'settle_on_casper',
    description:
      'Settle the payment for a compute request on the Casper blockchain by calling the contract ' +
      'entry point pay_agent. Signs and submits a REAL Casper testnet transaction and returns the ' +
      'deploy hash and explorer link. Call this after request_compute.',
    inputSchema: {
      type: 'object',
      properties: { request_id: { type: 'string', description: 'The request_id returned by request_compute.' } },
      required: ['request_id'],
    },
  },
  {
    name: 'get_compute_result',
    description:
      'Fetch the compute result after settlement. Verifies the Casper payment on-chain, then returns ' +
      'the LLM output. Call this after settle_on_casper.',
    inputSchema: {
      type: 'object',
      properties: { request_id: { type: 'string', description: 'The request_id that was settled.' } },
      required: ['request_id'],
    },
  },
];

const okText  = (text) => ({ content: [{ type: 'text', text }] });
const errText = (text) => ({ isError: true, content: [{ type: 'text', text }] });

async function handleRequestCompute(args) {
  const prompt = String((args && args.prompt) || '').trim();
  if (!prompt) return errText('prompt is required');
  await ensureRegistered();
  reqSeq += 1;
  const request_id = `infer-${reqSeq}-${SESSION}`;
  orders.set(request_id, { from: BUYER, to: PROVIDER, amount: PRICE_MOTES, prompt });
  return okText(
    `402 Payment Required — AiFinPay x402, settled on Casper.\n` +
    `To run this compute you must pay ${cspr(PRICE_MOTES)} CSPR (${PRICE_MOTES} motes) on Casper.\n\n` +
    `request_id:  ${request_id}\n` +
    `from_agent:  ${BUYER}\n` +
    `to_agent:    ${PROVIDER}\n` +
    `contract:    ${CONTRACT_HASH}\n` +
    `entry_point: pay_agent\n\n` +
    `Next: call settle_on_casper with request_id="${request_id}".`
  );
}

async function handleSettle(args) {
  const request_id = String((args && args.request_id) || '');
  const order = orders.get(request_id);
  if (!order) return errText(`unknown request_id "${request_id}" — call request_compute first.`);
  if (settled.has(request_id)) {
    const h = settled.get(request_id);
    return okText(`Already settled.\ndeploy:   ${h}\nexplorer: ${explorer(h)}`);
  }
  const pay = await callEntry('pay_agent', RuntimeArgs.fromMap({
    from_agent: CLValueBuilder.string(order.from),
    to_agent:   CLValueBuilder.string(order.to),
    amount:     CLValueBuilder.u512(order.amount),
    request_id: CLValueBuilder.string(request_id),
  }));
  await waitForSuccess(pay, 'pay_agent');
  settled.set(request_id, pay);
  return okText(
    `✅ Settled on Casper — pay_agent confirmed on testnet.\n` +
    `paid:        ${cspr(order.amount)} CSPR (${order.amount} motes)  ${order.from} → ${order.to}\n` +
    `request_id:  ${request_id}\n` +
    `deploy:      ${pay}\n` +
    `explorer:    ${explorer(pay)}\n\n` +
    `Now call get_compute_result with request_id="${request_id}".`
  );
}

async function handleGetResult(args) {
  const request_id = String((args && args.request_id) || '');
  const order = orders.get(request_id);
  if (!order) return errText(`unknown request_id "${request_id}".`);
  const deploy = settled.get(request_id);
  if (!deploy) return errText(`not settled yet — call settle_on_casper for "${request_id}" first.`);
  const s = await deployState(deploy);
  if (s.state !== 'success') return errText(`settlement not confirmed on-chain (state=${s.state}).`);
  const compute = await runCompute(order.prompt);
  return okText(
    `Compute delivered — paid & settled on Casper.\n\n` +
    `Result (${compute.live ? 'live provider' : 'demo mock'}):\n${compute.output}\n\n` +
    `Settlement proof:\n` +
    `  deploy:   ${explorer(deploy)}\n` +
    `  contract: https://testnet.cspr.live/contract/${CONTRACT_HASH.replace('hash-', '')}`
  );
}

// ── Wire up the MCP server ────────────────────────────────────────────────────
const server = new Server(
  { name: 'aifinpay-casper-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === 'request_compute')    return await handleRequestCompute(args || {});
    if (name === 'settle_on_casper')   return await handleSettle(args || {});
    if (name === 'get_compute_result') return await handleGetResult(args || {});
    return errText(`unknown tool: ${name}`);
  } catch (e) {
    return errText(`error in ${name}: ${(e && e.message) || e}`);
  }
});

log(`account:  ${accountHash}`);
log(`contract: ${CONTRACT_HASH}`);
log(`agents:   buyer=${BUYER} provider=${PROVIDER}`);
log(`compute:  ${UPSTREAM_URL && UPSTREAM_KEY ? UPSTREAM_URL : 'demo-mock (set COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY for real)'}`);

await server.connect(new StdioServerTransport());
log('ready (stdio) — tools: request_compute, settle_on_casper, get_compute_result');
