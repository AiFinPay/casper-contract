'use strict';

// Payment routes consume the reviewed deployment manifest. Environment
// variables cannot override trust. Deploying alone is insufficient.
const deployment = require('../deployments/casper-v2.json');
const CASPER_V2_CONTRACT_HASH = deployment.contractHash;

function normalize(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/^(hash|contract)-/, '') : '';
}

function assertTrustedContract(candidate) {
  const complete = deployment.status === 'verified'
    && deployment.contractVersion === '2.0.0'
    && /^(hash-|contract-)?[0-9a-f]{64}$/i.test(deployment.contractHash || '')
    && /^[0-9a-f]{64}$/i.test(deployment.deployHash || '')
    && /^[0-9a-f]{64}$/i.test(deployment.wasmSha256 || '')
    && /^[0-9a-f]{40}$/i.test(deployment.sourceCommit || '')
    && Boolean(deployment.deployedAt && deployment.verifiedAt);
  if (!complete || normalize(candidate) !== normalize(CASPER_V2_CONTRACT_HASH)) {
    throw new Error(
      'Casper payments are quarantined until the audited v2 deployment manifest is complete and verified.',
    );
  }
}

module.exports = { CASPER_V2_CONTRACT_HASH, assertTrustedContract, deployment };
