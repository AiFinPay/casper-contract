'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const casper = require('casper-js-sdk');

const { CLByteArray, CLValueBuilder, DeployUtil, RuntimeArgs } = casper;

function normalizeContractHash(value) {
  return String(value || '').replace(/^(hash-|contract-)/i, '').toLowerCase();
}

function loadVerifiedSessionWasm(wasmPath, expectedSha256) {
  if (!wasmPath) throw new Error('SESSION_WASM is required for Casper v2 payments');
  if (!/^[0-9a-f]{64}$/i.test(String(expectedSha256 || ''))) {
    throw new Error('verified Casper v2 sessionWasmSha256 is missing');
  }
  const bytes = fs.readFileSync(wasmPath);
  const actualSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualSha256.toLowerCase() !== String(expectedSha256).toLowerCase()) {
    throw new Error(`Casper payer-session Wasm hash mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }
  return new Uint8Array(bytes);
}

function buildPaySessionDeploy({
  publicKey,
  network,
  sessionWasm,
  contractHash,
  fromAgent,
  toAgent,
  amountMotes,
  requestId,
  gasMotes = '8000000000',
}) {
  const contractHex = normalizeContractHash(contractHash);
  if (!/^[0-9a-f]{64}$/.test(contractHex)) throw new Error('invalid Casper v2 contract hash');
  if (!(sessionWasm instanceof Uint8Array) || sessionWasm.byteLength === 0) {
    throw new Error('verified Casper payer-session Wasm is required');
  }
  const args = RuntimeArgs.fromMap({
    contract_hash: new CLByteArray(Uint8Array.from(Buffer.from(contractHex, 'hex'))),
    from_agent: CLValueBuilder.string(String(fromAgent)),
    to_agent: CLValueBuilder.string(String(toAgent)),
    amount: CLValueBuilder.u512(String(amountMotes)),
    request_id: CLValueBuilder.string(String(requestId)),
  });
  return DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(publicKey, network),
    DeployUtil.ExecutableDeployItem.newModuleBytes(sessionWasm, args),
    DeployUtil.standardPayment(String(gasMotes)),
  );
}

module.exports = { buildPaySessionDeploy, loadVerifiedSessionWasm, normalizeContractHash };
