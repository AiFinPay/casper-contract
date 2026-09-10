'use strict';

const path = require('path');

const DEFAULTS = {
  NODE_URL:     'https://node.testnet.casper.network/rpc',
  NETWORK_NAME: 'casper-test',
  KEYS_DIR:     'keys',
  PRICE_MOTES:  '100000000',   // 0.1 CSPR
};

function loadConfig(dir, {
  requireContract = false,
  requireProvider = false,
  mainnet = false,
} = {}) {
  const nodeUrl     = process.env.NODE_URL          || DEFAULTS.NODE_URL;
  const network     = process.env.NETWORK_NAME      || DEFAULTS.NETWORK_NAME;
  const keysDirRaw  = process.env.KEYS_DIR          || DEFAULTS.KEYS_DIR;
  const keysDir     = path.isAbsolute(keysDirRaw) ? keysDirRaw : path.join(dir, keysDirRaw);
  const contractHash = process.env.CONTRACT_HASH    || '';
  const providerAgent = process.env.PROVIDER_AGENT_ID || '';
  const priceMotes  = process.env.PRICE_MOTES       || DEFAULTS.PRICE_MOTES;
  const bridgePort  = parseInt(process.env.BRIDGE_PORT || '4055', 10);
  const orderTtlMs  = parseInt(process.env.ORDER_TTL_MS || '600000', 10);
  const maxPending  = parseInt(process.env.MAX_PENDING_ORDERS || '10000', 10);
  const upstreamUrl = process.env.COMPUTE_UPSTREAM_URL || '';
  const upstreamKey = process.env.COMPUTE_API_KEY      || '';
  const upstreamModel = process.env.COMPUTE_MODEL      || 'llama-3.3-70b';

  if (requireContract && !contractHash) {
    console.error('❌ CONTRACT_HASH not set in .env — run `node deploy.js` first.');
    process.exit(1);
  }
  if (requireProvider && !providerAgent) {
    console.error('❌ PROVIDER_AGENT_ID is required and must be registered by the provider wallet.');
    process.exit(1);
  }

  return {
    nodeUrl,
    network,
    keysDir,
    contractHash,
    providerAgent,
    priceMotes,
    bridgePort,
    orderTtlMs,
    maxPending,
    upstreamUrl,
    upstreamKey,
    upstreamModel,
  };
}

module.exports = { loadConfig, DEFAULTS };
