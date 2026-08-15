'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExecutedSettlement } = require('../settlement-verifier');
const { assertTrustedContract } = require('../trusted-contract');

const expected = {
  contract_hash: 'hash-aabbcc',
  request_id: 'order-1',
  from_agent: 'buyer-1',
  to_agent: 'merchant-1',
  amount_motes: '100000000',
};

function rpc(patch = {}) {
  const values = { ...expected, amount: expected.amount_motes, ...patch };
  return {
    execution_info: { execution_result: { Version2: { error_message: null } } },
    deploy: {
      session: {
        StoredContractByHash: {
          hash: values.contract_hash,
          entry_point: values.entry_point || 'pay_agent',
          args: [
            ['request_id', { parsed: values.request_id }],
            ['from_agent', { parsed: values.from_agent }],
            ['to_agent', { parsed: values.to_agent }],
            ['amount', { parsed: values.amount }],
          ].filter(([name]) => !values.omit || values.omit !== name),
        },
      },
    },
  };
}

test('accepts only the exact successful settlement', () => {
  assert.deepEqual(validateExecutedSettlement(rpc(), expected), { ok: true });
});

for (const [name, patch, reason] of [
  ['contract', { contract_hash: 'hash-deadbeef' }, 'contract_hash_mismatch'],
  ['entry point', { entry_point: 'register_agent' }, 'wrong_entry_point'],
  ['request', { request_id: 'order-2' }, 'request_id_mismatch'],
  ['payer', { from_agent: 'attacker' }, 'payer_mismatch'],
  ['recipient', { to_agent: 'attacker' }, 'recipient_mismatch'],
  ['underpayment', { amount: '99999999' }, 'amount_mismatch'],
  ['overpayment', { amount: '100000001' }, 'amount_mismatch'],
  ['invalid amount', { amount: 'not-a-number' }, 'amount_invalid'],
]) {
  test(`rejects wrong ${name}`, () => {
    assert.equal(validateExecutedSettlement(rpc(patch), expected).reason, reason);
  });
}

test('rejects missing required arguments instead of accepting execution success', () => {
  assert.equal(validateExecutedSettlement(rpc({ omit: 'amount' }), expected).reason, 'missing_amount');
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

test('payment entry points remain quarantined until the v2 manifest is verified', () => {
  assert.throws(() => assertTrustedContract('hash-aabbcc'), /payments are quarantined/);
});
