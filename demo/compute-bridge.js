/**
 * compute-bridge.js — AiFinPay x402 compute bridge, settled on Casper.
 *
 * An AI agent asks this bridge for compute (LLM inference). The bridge answers
 * HTTP 402 with a `pay_casper` instruction. The agent settles on-chain by
 * calling the AiFinPay Casper settlement contract's `pay_agent` entry point,
 * then retries with the deploy hash. The bridge VERIFIES the settlement on
 * Casper (read-only — no private key here) and only then returns the compute
 * result.
 *
 *   AI agent ──HTTP 402──> Casper pay_agent (real testnet tx) ──verify──> result
 *
 * This is the AiFinPay narrative: x402 is the payment protocol layer, Casper is
 * the settlement backend for autonomous agent-to-agent payments.
 *
 * No bridge private key is needed — settlement is verified by reading the
 * agent's on-chain deploy. Self-contained: built-in http + casper-js-sdk only.
 */

require('dotenv').config();
const http = require('http');
const { validateExecutedSettlement } = require('./settlement-verifier');
const { assertTrustedContract } = require('./trusted-contract');
const { loadConfig } = require('../lib/config');
const { rpc } = require('../lib/compute');

const cfg = loadConfig(__dirname, { requireContract: true, requireProvider: true });
assertTrustedContract(cfg.contractHash);

// Re-import runCompute from lib (compute-bridge uses lib/compute.js)
const { runCompute: libRunCompute } = require('../lib/compute');

const orders = new Map(); // request_id -> quote terms + creation time
const consumed = new Map(); // request_id -> fulfillment time
const inflight = new Set(); // verified requests currently computing

let seq = 0;
function newRequestId() {
  seq += 1;
  return `infer-${seq}-${process.pid}-${(process.hrtime.bigint() % 1000000n).toString()}`;
}

function send(res, code, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(body);
}

// 402 challenge — tells the agent exactly how to settle on Casper.
function challenge(res, fromAgent) {
  const now = Date.now();
  for (const [id, order] of orders) if (now - order.created_at > cfg.orderTtlMs) orders.delete(id);
  for (const [id, timestamp] of consumed) if (now - timestamp > cfg.orderTtlMs) consumed.delete(id);
  if (orders.size >= cfg.maxPending) {
    return send(res, 503, { error: 'payment_capacity_exceeded' });
  }
  const request_id = newRequestId();
  orders.set(request_id, {
    from_agent: fromAgent,
    to_agent: cfg.providerAgent,
    amount_motes: cfg.priceMotes,
    created_at: now,
  });
  return send(res, 402, {
    error: 'Payment Required',
    protocol: 'AiFinPay-x402',
    service: 'casper-compute-bridge',
    chain: 'casper',
    pay_casper: {
      chain: 'casper',
      network: cfg.network,
      contract_hash: cfg.contractHash,
      entry_point: 'pay_agent',
      from_agent: fromAgent,
      to_agent: cfg.providerAgent,
      amount_motes: cfg.priceMotes,
      request_id,
    },
    instructions: [
      `Both agents must be registered (register_agent) before settling.`,
      `Call ${cfg.contractHash} :: pay_agent(from_agent, to_agent, amount=${cfg.priceMotes} motes, request_id="${request_id}") on ${cfg.network}.`,
      `Retry POST /infer with headers x-casper-deploy: <deployHash> and x-request-id: ${request_id}.`,
    ],
  });
}

// Verify the agent's Casper deploy actually settled THIS order.
async function verifySettlement(deployHash, request_id) {
  const order = orders.get(request_id);
  if (!order) return { ok: false, reason: 'unknown_or_expired_request_id' };
  if (Date.now() - order.created_at > cfg.orderTtlMs) {
    orders.delete(request_id);
    return { ok: false, reason: 'unknown_or_expired_request_id' };
  }
  if (consumed.has(request_id) || inflight.has(request_id)) {
    return { ok: false, reason: 'request_id_already_fulfilled' };
  }

  let rpcResult;
  try {
    rpcResult = await rpc(cfg.nodeUrl, 'info_get_deploy', { deploy_hash: deployHash });
  } catch (e) {
    return { ok: false, reason: `info_get_deploy failed: ${e.message || e}` };
  }
  return validateExecutedSettlement(rpcResult, {
    contract_hash: cfg.contractHash,
    request_id,
    from_agent: order.from_agent,
    to_agent: order.to_agent,
    amount_motes: order.amount_motes,
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    return send(res, 200, {
      service: 'casper-compute-bridge',
      chain: 'casper',
      contract_hash: cfg.contractHash,
      price_motes: cfg.priceMotes,
      provider_agent: cfg.providerAgent,
    });
  }
  if (req.method !== 'POST' || req.url.split('?')[0] !== '/infer') {
    return send(res, 404, { error: 'not_found', try: 'POST /infer' });
  }

  let raw = '';
  req.on('data', (c) => {
    raw += c;
    if (raw.length > 1e6) req.destroy();
  });
  req.on('end', async () => {
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return send(res, 400, { error: 'invalid_json' });
    }

    const deployHash = req.headers['x-casper-deploy'];
    const reqId = req.headers['x-request-id'];
    const fromAgent = req.headers['x-agent-id'] || body.agent_id;

    // First call (no payment proof) → 402 challenge.
    if (!deployHash || !reqId) {
      if (!fromAgent)
        return send(res, 400, {
          error: 'missing_agent_id',
          detail: 'send x-agent-id header or {agent_id} in body',
        });
      return challenge(res, String(fromAgent));
    }

    // Retry with proof → verify on Casper, then compute.
    const v = await verifySettlement(String(deployHash), String(reqId));
    if (!v.ok) return send(res, 402, { error: 'payment_verification_failed', detail: v.reason });

    const order = orders.get(String(reqId));
    inflight.add(String(reqId));
    try {
      const compute = await libRunCompute(body.prompt, {
        upstreamUrl: cfg.upstreamUrl,
        upstreamKey: cfg.upstreamKey,
        upstreamModel: cfg.upstreamModel,
      });
      consumed.set(String(reqId), Date.now());
      return send(res, 200, {
        ok: true,
        settlement: {
          chain: 'casper',
          contract_hash: cfg.contractHash,
          request_id: reqId,
          from_agent: order && order.from_agent,
          to_agent: order && order.to_agent,
          amount_motes: order && order.amount_motes,
          deploy: deployHash,
          explorer: `https://testnet.cspr.live/deploy/${deployHash}`,
        },
        compute,
      });
    } catch (error) {
      return send(res, 502, {
        error: 'compute_upstream_failed',
        detail: error.message || String(error),
      });
    } finally {
      inflight.delete(String(reqId));
    }
  });
});

server.listen(cfg.bridgePort, () => {
  console.log(`[bridge] casper-compute-bridge listening on http://127.0.0.1:${cfg.bridgePort}`);
  console.log(`[bridge] settlement contract: ${cfg.contractHash}`);
  console.log(
    `[bridge] provider agent: ${cfg.providerAgent} · price: ${cfg.priceMotes} motes/call`
  );
  console.log(
    `[bridge] compute upstream: ${cfg.upstreamUrl && cfg.upstreamKey ? cfg.upstreamUrl : 'demo-mock (set COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY for real)'}`
  );
});
