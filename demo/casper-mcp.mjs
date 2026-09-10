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
 * PRICE_MOTES, PROVIDER_AGENT_ID (pre-registered by the provider), and optional
 * COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY for a real
 * LLM answer instead of the labelled demo mock.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import casper from 'casper-js-sdk';
import trustedContract from './trusted-contract.js';

// ── Shared lib imports (CJS via createRequire) ───────────────────────────────
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  callEntry: _callEntry,
  deployState: _deployState,
  waitForSuccess: _waitForSuccess,
  explorer: _explorer,
} = require('../lib/casper-helpers.js');
const { runCompute: _runCompute } = require('../lib/compute.js');
const { loadConfig } = require('../lib/config.js');

const { CasperClient, Keys, CLValueBuilder, RuntimeArgs } = casper;
const { assertTrustedContract } = trustedContract;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const cfg = loadConfig(__dirname, { requireContract: true, requireProvider: true });
assertTrustedContract(cfg.contractHash);

const log = (msg) => process.stderr.write(`[casper-mcp] ${msg}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const explorer = (h) => _explorer(h);
const cspr = (motes) => (Number(motes) / 1e9).toString();

// ── Casper plumbing ───────────────────────────────────────────────────────────
const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(path.join(cfg.keysDir, 'secret_key.pem'));
const accountHash = keypair.publicKey.toAccountHashStr();
const client = new CasperClient(cfg.nodeUrl);

async function callEntry(entryPoint, args) {
  return _callEntry(client, keypair, cfg.contractHash, cfg.network, entryPoint, args);
}

async function waitForSuccessLocal(deployHash, label) {
  return _waitForSuccess(cfg.nodeUrl, deployHash, label);
}

// ── Session state ─────────────────────────────────────────────────────────────
const SESSION = Math.random().toString(36).slice(2, 8);
const BUYER = `claude-agent-${SESSION}`;
const orders = new Map(); // request_id -> { from, to, amount, prompt }
const settled = new Map(); // request_id -> deployHash
let reqSeq = 0;

let registrationPromise = null;
function ensureRegistered() {
  if (!registrationPromise) {
    registrationPromise = (async () => {
      log(`registering buyer on-chain: ${BUYER} (one-time, ~30-60s)...`);
      const r1 = await callEntry(
        'register_agent',
        RuntimeArgs.fromMap({
          agent_id: CLValueBuilder.string(BUYER),
          wallet: CLValueBuilder.string(accountHash),
        })
      );
      await waitForSuccessLocal(r1, 'register buyer');
      log(`buyer registered (${explorer(r1)}); provider ${cfg.providerAgent} is pre-registered`);
      return { buyer: r1 };
    })().catch((e) => {
      registrationPromise = null;
      throw e;
    });
  }
  return registrationPromise;
}

async function runCompute(prompt) {
  return _runCompute(prompt, {
    upstreamUrl: cfg.upstreamUrl,
    upstreamKey: cfg.upstreamKey,
    upstreamModel: cfg.upstreamModel,
  });
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
      properties: {
        prompt: { type: 'string', description: 'The prompt to run once the payment settles.' },
      },
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
      properties: {
        request_id: { type: 'string', description: 'The request_id returned by request_compute.' },
      },
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
      properties: {
        request_id: { type: 'string', description: 'The request_id that was settled.' },
      },
      required: ['request_id'],
    },
  },
];

const okText = (text) => ({ content: [{ type: 'text', text }] });
const errText = (text) => ({ isError: true, content: [{ type: 'text', text }] });

async function handleRequestCompute(args) {
  const prompt = String((args && args.prompt) || '').trim();
  if (!prompt) return errText('prompt is required');
  await ensureRegistered();
  reqSeq += 1;
  const request_id = `infer-${reqSeq}-${SESSION}`;
  orders.set(request_id, { from: BUYER, to: cfg.providerAgent, amount: cfg.priceMotes, prompt });
  return okText(
    `402 Payment Required — AiFinPay x402, settled on Casper.\n` +
      `To run this compute you must pay ${cspr(cfg.priceMotes)} CSPR (${cfg.priceMotes} motes) on Casper.\n\n` +
      `request_id:  ${request_id}\n` +
      `from_agent:  ${BUYER}\n` +
      `to_agent:    ${cfg.providerAgent}\n` +
      `contract:    ${cfg.contractHash}\n` +
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
  const pay = await callEntry(
    'pay_agent',
    RuntimeArgs.fromMap({
      from_agent: CLValueBuilder.string(order.from),
      to_agent: CLValueBuilder.string(order.to),
      amount: CLValueBuilder.u512(order.amount),
      request_id: CLValueBuilder.string(request_id),
    })
  );
  await waitForSuccessLocal(pay, 'pay_agent');
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
  const s = await _deployState(cfg.nodeUrl, deploy);
  if (s.state !== 'success')
    return errText(`settlement not confirmed on-chain (state=${s.state}).`);
  const compute = await runCompute(order.prompt);
  return okText(
    `Compute delivered — paid & settled on Casper.\n\n` +
      `Result (${compute.live ? 'live provider' : 'demo mock'}):\n${compute.output}\n\n` +
      `Settlement proof:\n` +
      `  deploy:   ${explorer(deploy)}\n` +
      `  contract: https://testnet.cspr.live/contract/${cfg.contractHash.replace('hash-', '')}`
  );
}

// ── Wire up the MCP server ────────────────────────────────────────────────────
const server = new Server(
  { name: 'aifinpay-casper-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === 'request_compute') return await handleRequestCompute(args || {});
    if (name === 'settle_on_casper') return await handleSettle(args || {});
    if (name === 'get_compute_result') return await handleGetResult(args || {});
    return errText(`unknown tool: ${name}`);
  } catch (e) {
    return errText(`error in ${name}: ${(e && e.message) || e}`);
  }
});

log(`account:  ${accountHash}`);
log(`contract: ${cfg.contractHash}`);
log(`agents:   buyer=${BUYER} provider=${cfg.providerAgent}`);
log(
  `compute:  ${cfg.upstreamUrl && cfg.upstreamKey ? cfg.upstreamUrl : 'demo-mock (set COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY for real)'}`
);

await server.connect(new StdioServerTransport());
log('ready (stdio) — tools: request_compute, settle_on_casper, get_compute_result');
