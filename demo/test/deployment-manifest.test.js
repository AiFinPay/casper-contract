'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const MANIFEST = path.join(ROOT, 'deployments/casper-v2.json');
const SCRIPT = path.join(ROOT, 'scripts/deployment-manifest.mjs');

function runCheck() {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT, 'check'], { encoding: 'utf8' }) };
  } catch (error) {
    return { code: error.status, out: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

function withManifest(patch, fn) {
  const original = readFileSync(MANIFEST, 'utf8');
  try {
    writeFileSync(MANIFEST, JSON.stringify({ ...JSON.parse(original), ...patch }, null, 2) + '\n');
    return fn();
  } finally {
    writeFileSync(MANIFEST, original);
  }
}

const SHA = 'a'.repeat(64);
const COMMIT = 'b'.repeat(40);

test('the committed manifest is consistent', () => {
  assert.strictEqual(runCheck().code, 0);
});

test('a status past source_only must carry build evidence', () => {
  // The point of the gate: you cannot advance the status without the digests
  // and the commit that produced them.
  const result = withManifest({ status: 'built' }, runCheck);
  assert.notStrictEqual(result.code, 0);
  assert.match(result.out, /wasmSha256 missing/);
  assert.match(result.out, /sourceCommit missing/);
});

test('claiming a deployment requires a contract hash and deploy hash', () => {
  const result = withManifest(
    { status: 'deployed', wasmSha256: SHA, sessionWasmSha256: SHA, sourceCommit: COMMIT },
    runCheck,
  );
  assert.notStrictEqual(result.code, 0);
  assert.match(result.out, /contractHash missing/);
  assert.match(result.out, /deployHash missing/);
});

test('claiming verified requires a verification timestamp', () => {
  const result = withManifest(
    {
      status: 'verified',
      wasmSha256: SHA,
      sessionWasmSha256: SHA,
      sourceCommit: COMMIT,
      contractHash: SHA,
      deployHash: SHA,
      deployedAt: '2026-08-09T00:00:00Z',
      verifiedAt: null,
    },
    runCheck,
  );
  assert.notStrictEqual(result.code, 0);
  assert.match(result.out, /verifiedAt missing/);
});

test('a truncated contract hash is rejected, not normalised', () => {
  const result = withManifest(
    {
      status: 'deployed',
      wasmSha256: SHA,
      sessionWasmSha256: SHA,
      sourceCommit: COMMIT,
      contractHash: 'hash-abc123',
      deployHash: SHA,
      deployedAt: '2026-08-09T00:00:00Z',
    },
    runCheck,
  );
  assert.notStrictEqual(result.code, 0);
  assert.match(result.out, /contractHash missing/);
});

test('an unknown status is rejected rather than treated as safe', () => {
  const result = withManifest({ status: 'probably-fine' }, runCheck);
  assert.notStrictEqual(result.code, 0);
  assert.match(result.out, /unknown status/);
});

test('the wrong contract version is rejected', () => {
  const result = withManifest({ contractVersion: '1.0.0' }, runCheck);
  assert.notStrictEqual(result.code, 0);
  assert.match(result.out, /contractVersion must be/);
});
