'use strict';

const crypto = require('node:crypto');

function normalizeHash(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/^hash-/, '') : null;
}

function readSessionArgs(raw) {
  const session = raw && raw.deploy && raw.deploy.session;
  const moduleBytes = session && session.ModuleBytes;
  if (!moduleBytes || !Array.isArray(moduleBytes.args) || !/^[0-9a-f]+$/i.test(moduleBytes.module_bytes || '')) {
    return null;
  }
  const bytes = Buffer.from(moduleBytes.module_bytes, 'hex');
  if (bytes.length === 0) return null;
  const out = {
    execution: 'module_bytes',
    session_wasm_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
  for (const pair of moduleBytes.args) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const [name, clv] = pair;
    out[name] = clv && (clv.parsed !== undefined ? clv.parsed : clv);
  }
  return out;
}

function validateExecutedSettlement(rpc, expected) {
  if (!rpc) return { ok: false, reason: 'deploy_not_found' };
  const result = rpc.execution_info && rpc.execution_info.execution_result;
  if (!result) return { ok: false, reason: 'deploy_not_executed_yet' };
  if (result.Version2) {
    if (result.Version2.error_message) {
      return { ok: false, reason: `deploy_failed_on_chain: ${result.Version2.error_message}` };
    }
  } else if (result.Version1) {
    if (result.Version1.Failure) {
      return {
        ok: false,
        reason: `deploy_failed_on_chain: ${result.Version1.Failure.error_message || 'unknown'}`,
      };
    }
    if (!result.Version1.Success) return { ok: false, reason: 'deploy_not_successful' };
  } else {
    return { ok: false, reason: 'deploy_not_successful' };
  }

  const args = readSessionArgs(rpc);
  if (!args) return { ok: false, reason: 'unparseable_session_args' };
  if (!/^[0-9a-f]{64}$/i.test(String(expected.session_wasm_sha256 || ''))) {
    return { ok: false, reason: 'trusted_session_hash_missing' };
  }
  if (args.session_wasm_sha256 !== String(expected.session_wasm_sha256).toLowerCase()) {
    return { ok: false, reason: 'session_wasm_hash_mismatch' };
  }
  if (normalizeHash(args.contract_hash) !== normalizeHash(expected.contract_hash)) {
    return { ok: false, reason: 'contract_hash_mismatch' };
  }
  for (const key of ['request_id', 'from_agent', 'to_agent', 'amount']) {
    if (args[key] == null) return { ok: false, reason: `missing_${key}` };
  }
  if (String(args.request_id) !== String(expected.request_id)) {
    return { ok: false, reason: 'request_id_mismatch' };
  }
  if (String(args.from_agent) !== String(expected.from_agent)) {
    return { ok: false, reason: 'payer_mismatch' };
  }
  if (String(args.to_agent) !== String(expected.to_agent)) {
    return { ok: false, reason: 'recipient_mismatch' };
  }
  try {
    if (BigInt(String(args.amount)) !== BigInt(String(expected.amount_motes))) {
      return { ok: false, reason: 'amount_mismatch' };
    }
  } catch {
    return { ok: false, reason: 'amount_invalid' };
  }
  return { ok: true };
}

module.exports = { readSessionArgs, validateExecutedSettlement };
