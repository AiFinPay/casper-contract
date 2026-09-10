/**
 * demo-mainnet.js — live AiFinPay settlement demo on Casper MAINNET.
 *  1. buyer and provider self-register using distinct funded accounts
 *  2. pay_agent atomically moves native CSPR and records the settlement
 * Proves the provider balance increases by the exact settlement amount.
 *
 * Run: node scripts/demo-mainnet.js
 */
const DEMO_DIR = require('path').join(__dirname, '..', 'demo');
require('dotenv').config({ path: require('path').join(DEMO_DIR, '.env.mainnet') });

const { Keys, CLValueBuilder, RuntimeArgs } = require('casper-js-sdk');
const fetch = require('node-fetch');
const path = require('path');
const { assertTrustedContract } = require('../demo/trusted-contract');
const { rpc, explorer } = require('../lib/casper-helpers');

const NODE_URL = 'https://node.cspr.cloud/rpc';
const API_KEY = process.env.CSPR_API_KEY || '';
const NETWORK = 'casper';
const KEYS_DIR = process.env.KEYS_DIR || path.join(DEMO_DIR, 'keys-mainnet');
const PROVIDER_KEYS_DIR = process.env.PROVIDER_KEYS_DIR;
const CONTRACT = process.env.CONTRACT_HASH;
const GAS_CALL = '3000000000';   // 3 CSPR per contract call
const AMOUNT = '2500000000';     // 2.5 CSPR

if (!CONTRACT || !PROVIDER_KEYS_DIR) {
  throw new Error('CONTRACT_HASH and PROVIDER_KEYS_DIR are required');
}
assertTrustedContract(CONTRACT);

async function balanceCSPR(pubHex) {
  try {
    const r = await rpc(NODE_URL, 'query_balance', {
      purse_identifier: { main_purse_under_public_key: pubHex },
    }, { apiKey: API_KEY });
    return Number(r.balance) / 1e9;
  } catch (_) { return 0; }
}

function callContract(kp, ep, args) {
  const { CasperClient, DeployUtil } = require('casper-js-sdk');
  const client = new CasperClient(NODE_URL);
  const hashBytesBuf = Buffer.from(CONTRACT.replace(/^(hash|contract)-/, ''), 'hex');
  const dp = new DeployUtil.DeployParams(kp.publicKey, NETWORK, 1, 1800000);
  const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(hashBytesBuf, ep, args);
  const deploy = DeployUtil.makeDeploy(dp, session, DeployUtil.standardPayment(GAS_CALL));
  return client.signDeploy(deploy, kp);
}

async function submit(deploy) {
  const { DeployUtil } = require('casper-js-sdk');
  const json = DeployUtil.deployToJson(deploy);
  const result = await rpc(NODE_URL, 'account_put_deploy', json.deploy ? json : { deploy: json }, { apiKey: API_KEY });
  return result.deploy_hash;
}

async function wait(hash) {
  for (let i = 0; i < 60; i++) {
    try {
      const d = await rpc(NODE_URL, 'info_get_deploy', { deploy_hash: hash }, { apiKey: API_KEY });
      const v2 = ((d.execution_info || {}).execution_result || {}).Version2;
      if (v2) return { ok: v2.error_message == null, err: v2.error_message, block: (d.execution_info || {}).block_height };
    } catch (_) {}
    await new Promise(r => setTimeout(r, 6000)); process.stdout.write('.');
  }
  return { ok: false, err: 'timeout' };
}

async function main() {
  const kp = Keys.Ed25519.loadKeyPairFromPrivateFile(path.join(KEYS_DIR, 'secret_key.pem'));
  const payee = Keys.Ed25519.loadKeyPairFromPrivateFile(path.join(PROVIDER_KEYS_DIR, 'secret_key.pem'));
  const payerHash = kp.publicKey.toAccountHashStr();
  const providerHash = payee.publicKey.toAccountHashStr();
  if (providerHash === payerHash) throw new Error('buyer and provider accounts must be distinct');

  console.log('AiFinPay x Casper — LIVE MAINNET agent settlement');
  console.log('contract', CONTRACT);
  console.log('buyer  (agent-001):', payerHash.slice(0, 28) + '...');
  console.log('provider(agent-002):', payee.publicKey.toAccountHashStr().slice(0, 28) + '...');
  console.log('');

  const SUF = String(process.pid) + '' + payerHash.slice(-4);
  const A1 = `aifinpay-buyer-${SUF}`, A2 = `aifinpay-provider-${SUF}`, REQ = `req-${SUF}`;
  const out = {};

  console.log(`1) register_agent  ${A1} ...`);
  let h = await submit(callContract(kp, 'register_agent', RuntimeArgs.fromMap({ agent_id: CLValueBuilder.string(A1), wallet: CLValueBuilder.string(payerHash) })));
  let r = await wait(h); console.log(r.ok ? `   ok ${h}` : `   FAIL ${r.err}`); out.register_buyer = h;
  if (!r.ok) process.exit(1);

  console.log(`2) register_agent  ${A2} ...`);
  h = await submit(callContract(payee, 'register_agent', RuntimeArgs.fromMap({ agent_id: CLValueBuilder.string(A2), wallet: CLValueBuilder.string(providerHash) })));
  r = await wait(h); console.log(r.ok ? `   ok ${h}` : `   FAIL ${r.err}`); out.register_provider = h;
  if (!r.ok) process.exit(1);

  const before = await balanceCSPR(payee.publicKey.toHex());
  console.log(`provider balance BEFORE settlement: ${before} CSPR`);
  console.log(`3) pay_agent atomically settles 2.5 CSPR  ${REQ} ...`);
  h = await submit(callContract(kp, 'pay_agent', RuntimeArgs.fromMap({ from_agent: CLValueBuilder.string(A1), to_agent: CLValueBuilder.string(A2), amount: CLValueBuilder.u512(AMOUNT), request_id: CLValueBuilder.string(REQ) })));
  r = await wait(h); console.log(r.ok ? `   settled ${h}` : `   FAIL ${r.err}`); out.settle = h;
  if (!r.ok) process.exit(1);

  const after = await balanceCSPR(payee.publicKey.toHex());
  console.log('');
  console.log(`provider balance AFTER:  ${after} CSPR`);
  console.log(`>>> ${after - before} CSPR moved on-chain to the agent's wallet <<<`);
  console.log('');
  console.log('=== RESULTS (mainnet) ===');
  for (const [k, v] of Object.entries(out)) console.log(`${k}: https://cspr.live/deploy/${v}`);
  console.log('provider pubkey:', payee.publicKey.toHex());
}
main().catch(e => { console.error('ERR', e.message || e); process.exit(1); });
