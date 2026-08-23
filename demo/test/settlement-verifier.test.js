'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExecutedSettlement } = require('../settlement-verifier');
const { assertTrustedContract } = require('../trusted-contract');

const expected = {
  contract_hash: 'hash-' + 'aa'.repeat(32),
  route: 1,
  merchant: 'account-hash-' + 'bb'.repeat(32),
  gross_amount_motes: '100000000',
  request_id: 'order-1',
  valid_until_ms: '1900000000000',
  payer_public_key: '01' + 'cc'.repeat(32),
};

function rpc(patch = {}) {
  const values = {
    ...expected,
    gross_amount: expected.gross_amount_motes,
    ...patch,
  };
  return {
    execution_info: { execution_result: { Version2: { error_message: null } } },
    deploy: {
      header: { account: values.payer_public_key },
      session: {
        StoredContractByHash: {
          hash: values.contract_hash,
          entry_point: values.entry_point || 'pay',
          args: [
            ['route', { parsed: values.route }],
            ['merchant', { parsed: values.merchant }],
            ['gross_amount', { parsed: values.gross_amount }],
            ['request_id', { parsed: values.request_id }],
            ['valid_until_ms', { parsed: values.valid_until_ms }],
          ].filter(([name]) => !values.omit || values.omit !== name),
        },
      },
    },
  };
}

test('accepts only the exact successful canonical v3 settlement', () => {
  assert.deepEqual(validateExecutedSettlement(rpc(), expected), { ok: true });
});

for (const [name, patch, reason] of [
  ['contract', { contract_hash: 'hash-' + 'dd'.repeat(32) }, 'contract_hash_mismatch'],
  ['entry point', { entry_point: 'pay_agent' }, 'wrong_entry_point'],
  ['route', { route: 2 }, 'route_mismatch'],
  ['request', { request_id: 'order-2' }, 'request_id_mismatch'],
  ['merchant', { merchant: 'account-hash-' + 'ee'.repeat(32) }, 'merchant_mismatch'],
  ['underpayment', { gross_amount: '99999999' }, 'gross_amount_mismatch'],
  ['overpayment', { gross_amount: '100000001' }, 'gross_amount_mismatch'],
  ['invalid amount', { gross_amount: 'not-a-number' }, 'gross_amount_invalid'],
  ['expiry', { valid_until_ms: '1900000000001' }, 'valid_until_mismatch'],
  ['payer signer', { payer_public_key: '01' + 'ff'.repeat(32) }, 'payer_signer_mismatch'],
]) {
  test(`rejects wrong ${name}`, () => {
    assert.equal(validateExecutedSettlement(rpc(patch), expected).reason, reason);
  });
}

test('rejects invalid route values', () => {
  assert.equal(validateExecutedSettlement(rpc({ route: 3 }), expected).reason, 'route_invalid');
});

test('rejects missing required arguments instead of accepting execution success', () => {
  assert.equal(validateExecutedSettlement(rpc({ omit: 'gross_amount' }), expected).reason, 'missing_gross_amount');
});

test('rejects an unparseable session instead of accepting execution success', () => {
  const value = rpc();
  value.deploy.session = { ModuleBytes: { module_bytes: '', args: [] } };
  assert.equal(validateExecutedSettlement(value, expected).reason, 'unparseable_session_args');
});

test('rejects failed and pending deploys', () => {
  const failed = rpc();
  failed.execution_info.execution_result.Version2.error_message = 'revert';
  assert.match(validateExecutedSettlement(failed, expected).reason, /deploy_failed_on_chain/);
  assert.equal(validateExecutedSettlement({ deploy: rpc().deploy }, expected).reason, 'deploy_not_executed_yet');
});

test('payment entry points remain quarantined until the v3 manifest is verified', () => {
  assert.throws(() => assertTrustedContract(expected.contract_hash), /v3 deployment manifest/);
});
