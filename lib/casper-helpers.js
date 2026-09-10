'use strict';

const { CasperClient, DeployUtil } = require('casper-js-sdk');

const EXPLORER_TESTNET = 'https://testnet.cspr.live/deploy';
const EXPLORER_MAINNET = 'https://cspr.live/deploy';
const GAS_CALL = '5000000000'; // 5 CSPR per entry-point call
const POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_WAIT_MS = 120_000;

function explorer(hash, { mainnet = false } = {}) {
  const base = mainnet ? EXPLORER_MAINNET : EXPLORER_TESTNET;
  return `${base}/${hash}`;
}

function contractExplorer(contractHash, { mainnet = false } = {}) {
  const base = mainnet ? 'https://cspr.live/contract' : 'https://testnet.cspr.live/contract';
  return `${base}/${contractHash.replace('hash-', '')}`;
}

function hashBytes(contractHash) {
  return Buffer.from(contractHash.replace(/^(hash|contract)-/, ''), 'hex');
}

async function rpc(nodeUrl, method, params, { apiKey } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['Authorization'] = apiKey;
  const res = await fetch(nodeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  return data.result;
}

async function callEntry(client, keypair, contractHash, network, entryPoint, args, { gas = GAS_CALL } = {}) {
  const deployParams = new DeployUtil.DeployParams(keypair.publicKey, network, 1, 1800000);
  const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(
    hashBytes(contractHash), entryPoint, args,
  );
  const payment = DeployUtil.standardPayment(gas);
  const deploy = DeployUtil.makeDeploy(deployParams, session, payment);
  const signed = client.signDeploy(deploy, keypair);
  return client.putDeploy(signed);
}

function extractExecutionResult(rpcResult) {
  const er = rpcResult
    && rpcResult.execution_info
    && rpcResult.execution_info.execution_result;
  return er || null;
}

async function deployState(nodeUrl, deployHash) {
  const result = await rpc(nodeUrl, 'info_get_deploy', { deploy_hash: deployHash });
  const er = extractExecutionResult(result);
  if (!er) return { state: 'pending' };
  if (er.Version2) {
    return er.Version2.error_message
      ? { state: 'failed', error: er.Version2.error_message }
      : { state: 'success' };
  }
  if (er.Version1) {
    if (er.Version1.Failure) {
      return { state: 'failed', error: er.Version1.Failure.error_message || 'unknown' };
    }
    if (er.Version1.Success) return { state: 'success' };
  }
  return { state: 'pending' };
}

async function waitForSuccess(nodeUrl, deployHash, label, {
  maxWait = DEFAULT_MAX_WAIT_MS,
  pollInterval = POLL_INTERVAL_MS,
  onPoll,
} = {}) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const s = await deployState(nodeUrl, deployHash);
      if (s.state === 'success') return s;
      if (s.state === 'failed') throw new Error(`${label} failed on-chain: ${s.error}`);
    } catch (e) {
      if (/failed on-chain/.test(e.message)) throw e;
    }
    if (onPoll) onPoll();
    await new Promise(r => setTimeout(r, pollInterval));
  }
  throw new Error(`${label} timed out (${deployHash})`);
}

async function submitDeploy(nodeUrl, deploy, { apiKey } = {}) {
  const json = DeployUtil.deployToJson(deploy);
  const result = await rpc(nodeUrl, 'account_put_deploy', json.deploy ? json : { deploy: json }, { apiKey });
  return result.deploy_hash;
}

module.exports = {
  GAS_CALL,
  explorer,
  contractExplorer,
  hashBytes,
  rpc,
  callEntry,
  deployState,
  waitForSuccess,
  submitDeploy,
  extractExecutionResult,
};
