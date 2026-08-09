#!/usr/bin/env node
'use strict';

/**
 * Casper v2 deployment manifest tooling (§8.1).
 *
 * `deployments/casper-v2.json` is what `demo/trusted-contract.js` consults
 * before it will let a payment through, so every field in it is a security
 * claim. This script is the only sanctioned way to fill it, and it refuses to
 * write a claim it cannot substantiate.
 *
 * Three commands:
 *
 *   stage    build the Wasm, record both SHA-256 digests against the exact
 *            source commit, and leave status "built" — no deploy claimed
 *   verify   check the manifest is internally consistent and, when it claims
 *            "verified", that the on-chain contract really exists
 *   check    CI gate: fail if the manifest claims more than it can prove
 *
 * Filling in a contract hash by hand is what this exists to prevent: the
 * quarantine is only as good as the manifest behind it.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'deployments/casper-v2.json');
const CONTRACT_WASM = 'target/wasm32-unknown-unknown/release/aifinpay_casper.wasm';
const SESSION_WASM = 'target/wasm32-unknown-unknown/release/aifinpay_casper_pay_session.wasm';

const HEX64 = /^[0-9a-f]{64}$/i;
const HEX40 = /^[0-9a-f]{40}$/i;

function sha256(path) {
  const full = join(ROOT, path);
  if (!existsSync(full)) {
    fail(`${path} not found. Run scripts/build.sh first — a digest cannot be invented.`);
  }
  return createHash('sha256').update(readFileSync(full)).digest('hex');
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

function stage() {
  // A digest is only meaningful against a known tree. A dirty worktree means
  // the commit recorded here does not describe the bytes that were built.
  const dirty = git('status', '--porcelain');
  if (dirty) {
    fail(
      'Worktree is dirty. The recorded commit would not describe the built Wasm.\n' +
        'Commit or stash first:\n' +
        dirty,
    );
  }

  const manifest = readManifest();
  const staged = {
    ...manifest,
    status: 'built',
    wasmSha256: sha256(CONTRACT_WASM),
    sessionWasmSha256: sha256(SESSION_WASM),
    sourceCommit: git('rev-parse', 'HEAD'),
    // Deliberately left null. Only a real deployment may fill these, and
    // `verify` checks them against the chain before status may become
    // "verified".
    contractHash: null,
    deployHash: null,
    deployedAt: null,
    verifiedAt: null,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(staged, null, 2)}\n`);

  console.log('Staged deployment manifest:');
  console.log(`  sourceCommit        ${staged.sourceCommit}`);
  console.log(`  wasmSha256          ${staged.wasmSha256}`);
  console.log(`  sessionWasmSha256   ${staged.sessionWasmSha256}`);
  console.log('\nstatus = "built". Payments stay quarantined until a real');
  console.log('deployment is recorded and verified against the chain.');
}

/** Structural checks that hold for every status. */
function checkShape(m) {
  const problems = [];
  if (m.contractVersion !== '2.0.0') problems.push(`contractVersion must be "2.0.0", got ${m.contractVersion}`);
  if (!['source_only', 'built', 'deployed', 'verified'].includes(m.status)) {
    problems.push(`unknown status "${m.status}"`);
  }
  if (m.status !== 'source_only') {
    if (!HEX64.test(m.wasmSha256 || '')) problems.push('wasmSha256 missing or malformed');
    if (!HEX64.test(m.sessionWasmSha256 || '')) problems.push('sessionWasmSha256 missing or malformed');
    if (!HEX40.test(m.sourceCommit || '')) problems.push('sourceCommit missing or malformed');
  }
  if (m.status === 'deployed' || m.status === 'verified') {
    if (!/^(hash-|contract-)?[0-9a-f]{64}$/i.test(m.contractHash || '')) problems.push('contractHash missing');
    if (!HEX64.test(m.deployHash || '')) problems.push('deployHash missing');
    if (!m.deployedAt) problems.push('deployedAt missing');
  }
  if (m.status === 'verified' && !m.verifiedAt) problems.push('verifiedAt missing');
  return problems;
}

async function verify() {
  const m = readManifest();
  const problems = checkShape(m);
  if (problems.length) {
    for (const p of problems) console.error(`  - ${p}`);
    fail('Manifest is not internally consistent.');
  }

  if (m.status === 'source_only' || m.status === 'built') {
    console.log(`Manifest status "${m.status}". Nothing deployed, payments quarantined. OK.`);
    return;
  }

  // Claiming a deployment means the chain must agree.
  const node = process.env.CASPER_NODE_URL || 'https://node.mainnet.casper.network/rpc';
  const hash = String(m.contractHash).replace(/^(hash-|contract-)/i, '');
  const res = await fetch(node, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'state_get_item',
      params: { state_root_hash: null, key: `hash-${hash}`, path: [] },
    }),
  }).catch((e) => ({ error: e }));

  if (!res || res.error || typeof res.json !== 'function') {
    // Fail closed: an unreachable node is not evidence of a good deployment.
    fail(`Could not reach ${node} to confirm the contract exists. Refusing to pass.`);
  }
  const body = await res.json();
  if (body.error) {
    fail(`Chain does not confirm contract ${hash}: ${body.error.message}`);
  }
  console.log(`✓ Contract ${hash} confirmed on chain.`);
  console.log(`✓ Manifest status "${m.status}" is substantiated.`);
}

/** CI gate. Never reaches the network — structural claims only. */
function check() {
  const m = readManifest();
  const problems = checkShape(m);
  if (problems.length) {
    for (const p of problems) console.error(`  - ${p}`);
    fail('deployments/casper-v2.json makes claims it does not substantiate.');
  }
  if (m.status === 'verified') {
    // A "verified" manifest opens settlement, so CI must not be the thing
    // that waves it through — it has to have been checked against the chain.
    console.log('Manifest claims "verified". Run `verify` against a node before release.');
  }
  console.log(`✓ Manifest consistent (status: ${m.status}).`);
}

const command = process.argv[2] || 'check';
if (command === 'stage') stage();
else if (command === 'verify') await verify();
else if (command === 'check') check();
else fail(`Unknown command "${command}". Use stage | verify | check.`);
