'use strict';

// Production payment routes consume the reviewed v3 deployment manifest.
// Environment variables cannot override trust. Deploying alone is insufficient.
const deployment = require('../deployments/casper-v3.json');
const CASPER_V3_CONTRACT_HASH = deployment.contractHash;

function normalize(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/^(hash|contract)-/, '') : '';
}

function assertTrustedContract(candidate) {
  const complete = deployment.status === 'verified'
    && deployment.contractVersion === '3.0.0-rc.1'
    && deployment.routeModel?.['AIFP-1']?.treasuryBps === 100
    && deployment.routeModel?.['AIFP-1']?.creatorBps === 0
    && deployment.routeModel?.['AIFP-2']?.treasuryBps === 0
    && deployment.routeModel?.['AIFP-2']?.creatorBps === 0
    && /^(hash-|contract-)?[0-9a-f]{64}$/i.test(deployment.contractHash || '')
    && /^[0-9a-f]{64}$/i.test(deployment.deployHash || '')
    && /^[0-9a-f]{64}$/i.test(deployment.wasmSha256 || '')
    && /^[0-9a-f]{40}$/i.test(deployment.sourceCommit || '')
    && /^account-hash-[0-9a-f]{64}$/i.test(deployment.treasuryAccountHash || '')
    && /^account-hash-[0-9a-f]{64}$/i.test(deployment.adminAccountHash || '')
    && Boolean(deployment.deployedAt && deployment.verifiedAt && deployment.e2eEvidence);
  if (!complete || normalize(candidate) !== normalize(CASPER_V3_CONTRACT_HASH)) {
    throw new Error(
      'Casper payments are quarantined until the canonical v3 deployment manifest, artifact hash, governance and paid E2E evidence are complete and verified.',
    );
  }
}

module.exports = { CASPER_V3_CONTRACT_HASH, assertTrustedContract, deployment };
