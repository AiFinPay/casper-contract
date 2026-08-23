'use strict';

function normalizeHash(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/^(hash|contract)-/, '') : null;
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

function executionSucceeded(rpc) {
  if (!rpc) return { ok: false, reason: 'deploy_not_found' };
  const result = rpc.execution_info && rpc.execution_info.execution_result;
  if (!result) return { ok: false, reason: 'deploy_not_executed_yet' };
  if (result.Version2) {
    if (result.Version2.error_message) {
      return { ok: false, reason: `deploy_failed_on_chain: ${result.Version2.error_message}` };
    }
    return { ok: true };
  }
  if (result.Version1) {
    if (result.Version1.Failure) {
      return {
        ok: false,
        reason: `deploy_failed_on_chain: ${result.Version1.Failure.error_message || 'unknown'}`,
      };
    }
    return result.Version1.Success ? { ok: true } : { ok: false, reason: 'deploy_not_successful' };
  }
  return { ok: false, reason: 'deploy_not_successful' };
}

/**
 * Verify an executed canonical Casper settlement v3 call.
 *
 * expected fields:
 * - contract_hash
 * - route: 1 (AIFP-1) or 2 (AIFP-2)
 * - merchant: account-hash-...
 * - gross_amount_motes
 * - request_id
 * - valid_until_ms
 * - payer_public_key (optional; if supplied it must match deploy.header.account)
 */
function validateExecutedSettlement(rpc, expected) {
  const executed = executionSucceeded(rpc);
  if (!executed.ok) return executed;

  const args = readSessionArgs(rpc);
  if (!args) return { ok: false, reason: 'unparseable_session_args' };
  if (normalizeHash(args.contract_hash) !== normalizeHash(expected.contract_hash)) {
    return { ok: false, reason: 'contract_hash_mismatch' };
  }
  if (args.entry_point !== 'pay') return { ok: false, reason: 'wrong_entry_point' };

  for (const key of ['route', 'merchant', 'gross_amount', 'request_id', 'valid_until_ms']) {
    if (args[key] == null) return { ok: false, reason: `missing_${key}` };
  }

  const route = Number(args.route);
  if (!Number.isInteger(route) || (route !== 1 && route !== 2)) {
    return { ok: false, reason: 'route_invalid' };
  }
  if (route !== Number(expected.route)) {
    return { ok: false, reason: 'route_mismatch' };
  }
  if (String(args.request_id) !== String(expected.request_id)) {
    return { ok: false, reason: 'request_id_mismatch' };
  }
  if (String(args.merchant).toLowerCase() !== String(expected.merchant).toLowerCase()) {
    return { ok: false, reason: 'merchant_mismatch' };
  }
  try {
    if (BigInt(String(args.gross_amount)) !== BigInt(String(expected.gross_amount_motes))) {
      return { ok: false, reason: 'gross_amount_mismatch' };
    }
  } catch {
    return { ok: false, reason: 'gross_amount_invalid' };
  }
  try {
    if (BigInt(String(args.valid_until_ms)) !== BigInt(String(expected.valid_until_ms))) {
      return { ok: false, reason: 'valid_until_mismatch' };
    }
  } catch {
    return { ok: false, reason: 'valid_until_invalid' };
  }

  if (expected.payer_public_key != null) {
    const payer = rpc?.deploy?.header?.account;
    if (!payer || String(payer).toLowerCase() !== String(expected.payer_public_key).toLowerCase()) {
      return { ok: false, reason: 'payer_signer_mismatch' };
    }
  }

  return { ok: true };
}

module.exports = { readSessionArgs, validateExecutedSettlement };
