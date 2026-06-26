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
const { CasperClient } = require('casper-js-sdk');

const PORT             = parseInt(process.env.BRIDGE_PORT || '4055', 10);
const NODE_URL         = process.env.NODE_URL          || 'https://node.testnet.casper.network/rpc';
const NETWORK          = process.env.NETWORK_NAME      || 'casper-test';
const CONTRACT_HASH    = process.env.CONTRACT_HASH     || '';
const PROVIDER_AGENT   = process.env.PROVIDER_AGENT_ID || 'aifinpay-compute-provider';
const PRICE_MOTES      = process.env.PRICE_MOTES       || '100000000'; // 0.1 CSPR / call
// Optional real upstream (OpenAI-compatible). If unset, a labelled demo mock runs.
const UPSTREAM_URL     = process.env.COMPUTE_UPSTREAM_URL || '';
const UPSTREAM_KEY     = process.env.COMPUTE_API_KEY      || '';
const UPSTREAM_MODEL   = process.env.COMPUTE_MODEL        || 'llama-3.3-70b';

if (!CONTRACT_HASH) {
  console.error('[bridge] FATAL: CONTRACT_HASH not set (the deployed Casper settlement contract).');
  process.exit(1);
}

const client = new CasperClient(NODE_URL);
const orders = new Map();        // request_id -> { from_agent, to_agent, amount_motes }
const consumed = new Set();      // request_id already fulfilled (replay guard)

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
  const request_id = newRequestId();
  orders.set(request_id, { from_agent: fromAgent, to_agent: PROVIDER_AGENT, amount_motes: PRICE_MOTES });
  return send(res, 402, {
    error: 'Payment Required',
    protocol: 'AiFinPay-x402',
    service: 'casper-compute-bridge',
    chain: 'casper',
    pay_casper: {
      chain: 'casper',
      network: NETWORK,
      contract_hash: CONTRACT_HASH,
      entry_point: 'pay_agent',
      from_agent: fromAgent,
      to_agent: PROVIDER_AGENT,
      amount_motes: PRICE_MOTES,
      request_id,
    },
    instructions: [
      `Both agents must be registered (register_agent) before settling.`,
      `Call ${CONTRACT_HASH} :: pay_agent(from_agent, to_agent, amount=${PRICE_MOTES} motes, request_id="${request_id}") on ${NETWORK}.`,
      `Retry POST /infer with headers x-casper-deploy: <deployHash> and x-request-id: ${request_id}.`,
    ],
  });
}

// Pull an arg's parsed value out of a getDeploy raw response (StoredContractByHash).
function readSessionArgs(raw) {
  const s = raw && raw.deploy && raw.deploy.session;
  const sc = s && (s.StoredContractByHash || s.StoredVersionedContractByHash);
  if (!sc || !Array.isArray(sc.args)) return null;
  const out = { entry_point: sc.entry_point };
  for (const pair of sc.args) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [name, clv] = pair;
    out[name] = clv && (clv.parsed !== undefined ? clv.parsed : clv);
  }
  return out;
}

// Verify the agent's Casper deploy actually settled THIS order.
async function verifySettlement(deployHash, request_id) {
  const order = orders.get(request_id);
  if (!order) return { ok: false, reason: 'unknown_or_expired_request_id' };
  if (consumed.has(request_id)) return { ok: false, reason: 'request_id_already_fulfilled' };

  // Casper 2.0: read info_get_deploy directly (casper-js-sdk 2.15.4 parses the
  // legacy execution_results, empty on a 2.0 node).
  let rpc;
  try {
    const r = await fetch(NODE_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'info_get_deploy', params: { deploy_hash: deployHash } }),
    });
    rpc = (await r.json()).result;
  } catch (e) {
    return { ok: false, reason: `info_get_deploy failed: ${e.message || e}` };
  }
  if (!rpc) return { ok: false, reason: 'deploy_not_found' };
  const er = rpc.execution_info && rpc.execution_info.execution_result;
  if (!er) return { ok: false, reason: 'deploy_not_executed_yet' };
  if (er.Version2 && er.Version2.error_message) return { ok: false, reason: `deploy_failed_on_chain: ${er.Version2.error_message}` };
  if (er.Version1 && er.Version1.Failure) return { ok: false, reason: `deploy_failed_on_chain: ${er.Version1.Failure.error_message || 'unknown'}` };
  if (!er.Version2 && !er.Version1) return { ok: false, reason: 'deploy_not_successful' };

  // Strict check: confirm it was pay_agent for THIS request_id / recipient / amount.
  const args = readSessionArgs(rpc);
  if (args) {
    if (args.entry_point && args.entry_point !== 'pay_agent') {
      return { ok: false, reason: `wrong_entry_point: ${args.entry_point}` };
    }
    if (args.request_id != null && String(args.request_id) !== String(request_id)) {
      return { ok: false, reason: `request_id_mismatch: ${args.request_id}` };
    }
    if (args.to_agent != null && String(args.to_agent) !== String(order.to_agent)) {
      return { ok: false, reason: `recipient_mismatch: ${args.to_agent}` };
    }
    if (args.amount != null) {
      try {
        if (BigInt(String(args.amount)) < BigInt(String(order.amount_motes))) {
          return { ok: false, reason: `underpaid: ${args.amount} < ${order.amount_motes}` };
        }
      } catch { /* non-numeric parsed amount — skip strict amount check */ }
    }
  } else {
    console.warn('[bridge] could not parse session args — accepting on execution success only');
  }
  return { ok: true };
}

// The actual compute. Real OpenAI-compatible upstream if configured, else a
// clearly-labelled demo mock so the flow runs end-to-end without extra keys.
async function runCompute(prompt) {
  if (UPSTREAM_URL && UPSTREAM_KEY) {
    const r = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${UPSTREAM_KEY}` },
      body: JSON.stringify({ model: UPSTREAM_MODEL, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return { provider: UPSTREAM_URL, model: UPSTREAM_MODEL, output: text || JSON.stringify(j).slice(0, 500), live: true };
  }
  // Demo mock — deterministic, clearly labelled. Replace by setting
  // COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY (any OpenAI-compatible provider).
  const words = String(prompt || '').trim().split(/\s+/).filter(Boolean).length;
  return {
    provider: 'demo-mock',
    model: 'aifinpay-demo-llm',
    output: `[DEMO COMPUTE] Processed a ${words}-word prompt and produced an inference result. ` +
            `Set COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY to route this to a real provider (Venice / io.net / any OpenAI-compatible API).`,
    live: false,
  };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    return send(res, 200, { service: 'casper-compute-bridge', chain: 'casper', contract_hash: CONTRACT_HASH, price_motes: PRICE_MOTES, provider_agent: PROVIDER_AGENT });
  }
  if (req.method !== 'POST' || req.url.split('?')[0] !== '/infer') {
    return send(res, 404, { error: 'not_found', try: 'POST /infer' });
  }

  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on('end', async () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return send(res, 400, { error: 'invalid_json' }); }

    const deployHash = req.headers['x-casper-deploy'];
    const reqId      = req.headers['x-request-id'];
    const fromAgent  = req.headers['x-agent-id'] || body.agent_id;

    // First call (no payment proof) → 402 challenge.
    if (!deployHash || !reqId) {
      if (!fromAgent) return send(res, 400, { error: 'missing_agent_id', detail: 'send x-agent-id header or {agent_id} in body' });
      return challenge(res, String(fromAgent));
    }

    // Retry with proof → verify on Casper, then compute.
    const v = await verifySettlement(String(deployHash), String(reqId));
    if (!v.ok) return send(res, 402, { error: 'payment_verification_failed', detail: v.reason });

    consumed.add(String(reqId));
    const order = orders.get(String(reqId));
    const compute = await runCompute(body.prompt);
    return send(res, 200, {
      ok: true,
      settlement: {
        chain: 'casper',
        contract_hash: CONTRACT_HASH,
        request_id: reqId,
        from_agent: order && order.from_agent,
        to_agent: order && order.to_agent,
        amount_motes: order && order.amount_motes,
        deploy: deployHash,
        explorer: `https://testnet.cspr.live/deploy/${deployHash}`,
      },
      compute,
    });
  });
});

server.listen(PORT, () => {
  console.log(`[bridge] casper-compute-bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`[bridge] settlement contract: ${CONTRACT_HASH}`);
  console.log(`[bridge] provider agent: ${PROVIDER_AGENT} · price: ${PRICE_MOTES} motes/call`);
  console.log(`[bridge] compute upstream: ${UPSTREAM_URL && UPSTREAM_KEY ? UPSTREAM_URL : 'demo-mock (set COMPUTE_UPSTREAM_URL + COMPUTE_API_KEY for real)'}`);
});
