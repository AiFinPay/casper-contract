'use strict';

function normalizeHash(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/^hash-/, '') : null;
}

function readSessionArgs(raw) {
  const session = raw && raw.deploy && raw.deploy.session;
  const stored = session && (session.StoredContractByHash || session.StoredVersionedContractByHash);
  if (!stored || !Array.isArray(stored.args)) return null;
  const out = { entry_point: stored.entry_point, contract_hash: stored.hash };
  for (const pair of stored.args) {
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
  if (normalizeHash(args.contract_hash) !== normalizeHash(expected.contract_hash)) {
    return { ok: false, reason: 'contract_hash_mismatch' };
  }
  if (args.entry_point !== 'pay_agent') return { ok: false, reason: 'wrong_entry_point' };
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
