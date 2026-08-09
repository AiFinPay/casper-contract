'use strict';

/**
 * Negative on-chain settlement tests for Casper v2 (§8.1).
 *
 * `testnet-verify.js` proves the happy path moves CSPR. This proves the paths
 * that must NOT move it: a forged payer, a zero amount, a self-payment, a
 * malformed identifier and a replay. Each case asserts the specific User error
 * the contract defines, not merely that the deploy failed — "it reverted" is
 * satisfied by running out of gas, which would let a broken guard pass.
 *
 * It finishes with a balance-delta check on a valid payment, so a run that
 * rejects everything (including what it should accept) cannot look like a pass.
 *
 * Requires testnet keys and a deployed contract. Nothing here touches mainnet.
 *
 *   BUYER_KEYS=keys-testnet-fresh PROVIDER_KEYS=keys \
 *   CONTRACT_HASH_HEX=<hash> SESSION_WASM=<path> node testnet-negative.js
 */

const fs = require('node:fs');
const { DeployUtil, Keys, RuntimeArgs, CLValueBuilder, CLByteArray } = require('casper-js-sdk');

const NODE = process.env.NODE_URL || 'https://node.testnet.casper.network/rpc';
const NETWORK = 'casper-test';
const BUYER_KEYS = process.env.BUYER_KEYS || 'keys-testnet-fresh';
const PROVIDER_KEYS = process.env.PROVIDER_KEYS || 'keys';
const CONTRACT = process.env.CONTRACT_HASH_HEX;
const SESSION_WASM = process.env.SESSION_WASM;
const GAS = '8000000000';
const AMOUNT = '2500000000'; // 2.5 CSPR

// From src/main.rs. Asserted exactly: a test that accepts any revert would
// also accept an out-of-gas failure and report a guard as working.
const ERR = {
  AGENT_NOT_FOUND: 101,
  ALREADY_SETTLED: 102,
  UNAUTHORIZED: 103,
  INVALID_IDENTIFIER: 105,
  INVALID_AMOUNT: 106,
  SELF_PAYMENT: 107,
};

function requireEnv() {
  const missing = [];
  if (!CONTRACT) missing.push('CONTRACT_HASH_HEX');
  if (!SESSION_WASM) missing.push('SESSION_WASM');
  if (missing.length) {
    console.error(`Refusing to run without: ${missing.join(', ')}`);
    console.error('These tests are meaningless against an unknown contract.');
    process.exit(2);
  }
  if (!fs.existsSync(SESSION_WASM)) {
    console.error(`SESSION_WASM not found at ${SESSION_WASM}`);
    process.exit(2);
  }
}

async function rpc(method, params) {
  const res = await fetch(NODE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

async function balance(publicKeyHex) {
  const sr = (await rpc('chain_get_state_root_hash', [])).result.state_root_hash;
  const ai = await rpc('state_get_account_info', { public_key: publicKeyHex });
  const b = await rpc('state_get_balance', {
    state_root_hash: sr,
    purse_uref: ai.result.account.main_purse,
  });
  return BigInt(b.result.balance_value);
}

async function awaitDeploy(hash) {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    const info = await rpc('info_get_deploy', { deploy_hash: hash });
    const executionInfo = info.result?.execution_info;
    if (!executionInfo?.execution_result) {
      process.stdout.write('.');
      continue;
    }
    const v2 = executionInfo.execution_result.Version2;
    if (v2?.error_message) return { ok: false, error: v2.error_message };
    return { ok: true, cost: v2?.consumed };
  }
  return { ok: false, error: 'timeout' };
}

/**
 * Casper reports a User error as "User error: N". Matching the number matters:
 * accepting any failure would let an out-of-gas run masquerade as a working
 * guard.
 */
function userErrorCode(message) {
  const match = /User error:\s*(\d+)/i.exec(String(message || ''));
  return match ? Number(match[1]) : null;
}

function buildSettlement(buyer, args) {
  const session = DeployUtil.ExecutableDeployItem.newModuleBytes(
    new Uint8Array(fs.readFileSync(SESSION_WASM)),
    RuntimeArgs.fromMap({
      contract_hash: new CLByteArray(Uint8Array.from(Buffer.from(CONTRACT, 'hex'))),
      from_agent: CLValueBuilder.string(args.from_agent),
      to_agent: CLValueBuilder.string(args.to_agent),
      amount: CLValueBuilder.u512(args.amount),
      request_id: CLValueBuilder.string(args.request_id),
    }),
  );
  return DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(buyer.publicKey, NETWORK),
    session,
    DeployUtil.standardPayment(GAS),
  );
}

async function send(keys, args) {
  const deploy = DeployUtil.signDeploy(buildSettlement(keys, args), keys);
  const hash = await new Promise((resolve, reject) => {
    rpc('account_put_deploy', { deploy: DeployUtil.deployToJson(deploy).deploy })
      .then((r) => (r.error ? reject(new Error(r.error.message)) : resolve(r.result.deploy_hash)))
      .catch(reject);
  });
  return awaitDeploy(hash);
}

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function expectRevert(name, keys, args, expectedCode) {
  const outcome = await send(keys, args);
  if (outcome.ok) {
    record(name, false, 'settlement SUCCEEDED but must have been rejected');
    return;
  }
  const code = userErrorCode(outcome.error);
  if (code !== expectedCode) {
    record(name, false, `expected User error ${expectedCode}, got: ${outcome.error}`);
    return;
  }
  record(name, true, `User error ${code}`);
}

(async () => {
  requireEnv();
  const buyer = Keys.Ed25519.parseKeyFiles(
    `${BUYER_KEYS}/public_key.pem`,
    `${BUYER_KEYS}/secret_key.pem`,
  );
  const provider = Keys.Ed25519.parseKeyFiles(
    `${PROVIDER_KEYS}/public_key.pem`,
    `${PROVIDER_KEYS}/secret_key.pem`,
  );
  const BUYER_AGENT = process.env.BUYER_AGENT || 'agent-buyer';
  const PROVIDER_AGENT = process.env.PROVIDER_AGENT || 'agent-provider';
  const stamp = Date.now();

  // 1. Forged payer — the buyer signs but names the provider as from_agent.
  //    The caller-bound check must refuse it.
  await expectRevert(
    'forged payer cannot settle from another agent',
    buyer,
    {
      from_agent: PROVIDER_AGENT,
      to_agent: BUYER_AGENT,
      amount: AMOUNT,
      request_id: `neg-forged-${stamp}`,
    },
    ERR.UNAUTHORIZED,
  );

  // 2. Zero amount — a settled receipt for nothing is still a receipt, and a
  //    merchant would honour it.
  await expectRevert(
    'zero amount is refused',
    buyer,
    {
      from_agent: BUYER_AGENT,
      to_agent: PROVIDER_AGENT,
      amount: '0',
      request_id: `neg-zero-${stamp}`,
    },
    ERR.INVALID_AMOUNT,
  );

  // 3. Self-payment — would let an agent mint proof of payment for free.
  await expectRevert(
    'self-payment is refused',
    buyer,
    {
      from_agent: BUYER_AGENT,
      to_agent: BUYER_AGENT,
      amount: AMOUNT,
      request_id: `neg-self-${stamp}`,
    },
    ERR.SELF_PAYMENT,
  );

  // 4. Malformed identifier — the record and event are built by string
  //    formatting, so the charset guard is what keeps them parseable.
  await expectRevert(
    'malformed request id is refused',
    buyer,
    {
      from_agent: BUYER_AGENT,
      to_agent: PROVIDER_AGENT,
      amount: AMOUNT,
      request_id: `neg bad"id-${stamp}`,
    },
    ERR.INVALID_IDENTIFIER,
  );

  // 5. Unregistered agent.
  await expectRevert(
    'unregistered agent cannot be paid',
    buyer,
    {
      from_agent: BUYER_AGENT,
      to_agent: `agent-nobody-${stamp}`,
      amount: AMOUNT,
      request_id: `neg-unknown-${stamp}`,
    },
    ERR.AGENT_NOT_FOUND,
  );

  // 6. Valid payment with a balance delta, then 7. the same id replayed.
  //    Ordered this way because replay can only be tested after something
  //    real has been settled.
  const replayId = `neg-replay-${stamp}`;
  const providerBefore = await balance(provider.publicKey.toHex());
  const good = await send(buyer, {
    from_agent: BUYER_AGENT,
    to_agent: PROVIDER_AGENT,
    amount: AMOUNT,
    request_id: replayId,
  });
  if (!good.ok) {
    record('valid payment settles', false, good.error);
  } else {
    const providerAfter = await balance(provider.publicKey.toHex());
    const delta = providerAfter - providerBefore;
    // The recipient pays no gas, so the delta must be the amount exactly.
    record(
      'valid payment settles and moves exactly the amount',
      delta === BigInt(AMOUNT),
      `delta ${delta} motes, expected ${AMOUNT}`,
    );
  }

  await expectRevert(
    'replaying a settled request id is refused',
    buyer,
    {
      from_agent: BUYER_AGENT,
      to_agent: PROVIDER_AGENT,
      amount: AMOUNT,
      request_id: replayId,
    },
    ERR.ALREADY_SETTLED,
  );

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.error('Casper v2 is NOT ready. Failing cases:');
    for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
