/**
 * demo-mainnet.js — live AiFinPay settlement demo on Casper MAINNET.
 *  1. register_agent  (buyer + provider) on the live contract
 *  2. pay_agent       records the settlement on-chain (event + idempotency)
 *  3. a real native CSPR transfer moves value to the provider's wallet
 *  Proves the provider balance went 0 -> N CSPR. Payee key is SAVED so funds aren't lost.
 */
const { DeployUtil, Keys, CLValueBuilder, RuntimeArgs } = require('casper-js-sdk');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const NODE_URL = 'https://node.cspr.cloud/rpc';
const API = 'https://api.cspr.cloud';
const KEY = process.env.CSPR_API_KEY || '';
const NETWORK = 'casper';
const KEYS_DIR = path.join(__dirname, 'keys-mainnet');
const CONTRACT = process.env.CONTRACT || 'contract-9903a5e3948e799196df54b17270bc6769338ac1cc36c9eb47e113f88d23f019';
const GAS_CALL = '3000000000';   // 3 CSPR per contract call
const AMOUNT = '2500000000';     // 2.5 CSPR (native-transfer minimum)

async function rpc(method, params) {
  const r = await fetch(NODE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': KEY }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
  const d = await r.json(); if (d.error) throw new Error(JSON.stringify(d.error)); return d.result;
}
async function submit(deploy) { const j = DeployUtil.deployToJson(deploy); return (await rpc('account_put_deploy', j.deploy ? j : { deploy: j })).deploy_hash; }
// Casper 2.x: real verdict is under execution_info.execution_result.Version2
async function wait(hash) {
  for (let i = 0; i < 60; i++) {
    try {
      const d = await rpc('info_get_deploy', { deploy_hash: hash });
      const v2 = ((d.execution_info || {}).execution_result || {}).Version2;
      if (v2) return { ok: v2.error_message == null, err: v2.error_message, block: (d.execution_info || {}).block_height };
    } catch (_) {}
    await new Promise(r => setTimeout(r, 6000)); process.stdout.write('.');
  }
  return { ok: false, err: 'timeout' };
}
async function balanceCSPR(pubHex) {
  try { const b = (await rpc('query_balance', { purse_identifier: { main_purse_under_public_key: pubHex } })).balance; return Number(b) / 1e9; } catch (_) { return 0; }
}
function callContract(kp, ep, args) {
  const hashBytes = Buffer.from(CONTRACT.replace('contract-', '').replace('hash-', ''), 'hex');
  const dp = new DeployUtil.DeployParams(kp.publicKey, NETWORK, 1, 1800000);
  const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(hashBytes, ep, args);
  return DeployUtil.signDeploy(DeployUtil.makeDeploy(dp, session, DeployUtil.standardPayment(GAS_CALL)), kp);
}

async function main() {
  const kp = Keys.Ed25519.loadKeyPairFromPrivateFile(path.join(KEYS_DIR, 'secret_key.pem'));
  const payerHash = kp.publicKey.toAccountHashStr();
  // provider wallet — SAVE the key so the transferred CSPR is recoverable
  const payee = Keys.Ed25519.new();
  const payeeDir = path.join(__dirname, 'keys-mainnet-demo-payee');
  fs.mkdirSync(payeeDir, { recursive: true });
  fs.writeFileSync(path.join(payeeDir, 'secret_key.pem'), payee.exportPrivateKeyInPem());
  fs.writeFileSync(path.join(payeeDir, 'public_key.pem'), payee.exportPublicKeyInPem());
  fs.writeFileSync(path.join(payeeDir, 'public_key_hex.txt'), payee.publicKey.toHex());

  console.log('AiFinPay x Casper — LIVE MAINNET agent settlement');
  console.log('contract', CONTRACT);
  console.log('buyer  (agent-001):', payerHash.slice(0, 28) + '...');
  console.log('provider(agent-002):', payee.publicKey.toAccountHashStr().slice(0, 28) + '...');
  console.log('');

  const before = await balanceCSPR(payee.publicKey.toHex());
  console.log(`provider balance BEFORE: ${before} CSPR`);
  console.log('');

  const SUF = String(process.pid) + '' + payerHash.slice(-4);
  const A1 = `aifinpay-buyer-${SUF}`, A2 = `aifinpay-provider-${SUF}`, REQ = `req-${SUF}`;
  const out = {};

  console.log(`1) register_agent  ${A1} ...`);
  let h = await submit(callContract(kp, 'register_agent', RuntimeArgs.fromMap({ agent_id: CLValueBuilder.string(A1), wallet: CLValueBuilder.string(payerHash) })));
  let r = await wait(h); console.log(r.ok ? `   ok ${h}` : `   FAIL ${r.err}`); out.register_buyer = h;
  if (!r.ok) process.exit(1);

  console.log(`2) register_agent  ${A2} ...`);
  h = await submit(callContract(kp, 'register_agent', RuntimeArgs.fromMap({ agent_id: CLValueBuilder.string(A2), wallet: CLValueBuilder.string(payee.publicKey.toAccountHashStr()) })));
  r = await wait(h); console.log(r.ok ? `   ok ${h}` : `   FAIL ${r.err}`); out.register_provider = h;
  if (!r.ok) process.exit(1);

  console.log(`3) pay_agent  settle 2.5 CSPR  ${REQ} ...`);
  h = await submit(callContract(kp, 'pay_agent', RuntimeArgs.fromMap({ from_agent: CLValueBuilder.string(A1), to_agent: CLValueBuilder.string(A2), amount: CLValueBuilder.u512(AMOUNT), request_id: CLValueBuilder.string(REQ) })));
  r = await wait(h); console.log(r.ok ? `   settled ${h}` : `   FAIL ${r.err}`); out.settle = h;
  if (!r.ok) process.exit(1);

  console.log('4) native transfer  2.5 CSPR  buyer -> provider ...');
  const dp = new DeployUtil.DeployParams(kp.publicKey, NETWORK, 1, 1800000);
  const xfer = DeployUtil.ExecutableDeployItem.newTransfer(AMOUNT, payee.publicKey, null, 1);
  h = await submit(DeployUtil.signDeploy(DeployUtil.makeDeploy(dp, xfer, DeployUtil.standardPayment('100000000')), kp));
  r = await wait(h); console.log(r.ok ? `   moved ${h}` : `   FAIL ${r.err}`); out.transfer = h;

  const after = await balanceCSPR(payee.publicKey.toHex());
  console.log('');
  console.log(`provider balance AFTER:  ${after} CSPR`);
  console.log(`>>> ${after - before} CSPR moved on-chain to the agent's wallet <<<`);
  console.log('');
  console.log('=== RESULTS (mainnet) ===');
  for (const [k, v] of Object.entries(out)) console.log(`${k}: https://cspr.live/deploy/${v}`);
  console.log('provider pubkey:', payee.publicKey.toHex());
  fs.writeFileSync(path.join(__dirname, 'demo-mainnet.out.json'), JSON.stringify({ contract: CONTRACT, ...out, provider_pubkey: payee.publicKey.toHex() }, null, 2));
}
main().catch(e => { console.error('ERR', e.message || e); process.exit(1); });
