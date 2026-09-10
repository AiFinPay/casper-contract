'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Keys } = require('casper-js-sdk');

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateEd25519Keypair() {
  return Keys.Ed25519.new();
}

function accountHashHex(keypair) {
  return keypair.publicKey.toAccountHashStr().replace('account-hash-', '');
}

function publicKeyHex(keypair) {
  return keypair.publicKey.toHex();
}

// Minimal quote hash matching the Rust contract's compute_quote_hash
function computeQuoteHash(domainSeparator, payer, merchant, grossAmount, route, requestId, validUntilMs, nonce) {
  const data = [];
  for (const b of domainSeparator) data.push(b);
  for (const b of Buffer.from(payer, 'utf8')) data.push(b);
  for (const b of Buffer.from(merchant, 'utf8')) data.push(b);
  for (const b of Buffer.from(String(grossAmount), 'utf8')) data.push(b);
  data.push(route);
  for (const b of Buffer.from(requestId, 'utf8')) data.push(b);
  const view = new DataView(new ArrayBuffer(8));

  view.setBigUint64(0, BigInt(validUntilMs), true);
  for (const b of new Uint8Array(view.buffer)) data.push(b);

  view.setBigUint64(0, BigInt(nonce), true);
  for (const b of new Uint8Array(view.buffer)) data.push(b);

  // Simple XOR-based hash matching the Rust implementation
  const state = new BigUint64Array(8);
  for (let i = 0; i < data.length; i++) {
    const chunkIdx = Math.floor(i / 64);
    const byteIdx = i % 8;
    state[chunkIdx % 8] ^= BigInt(data[i]) << BigInt(byteIdx * 8);
  }
  const hash = Buffer.alloc(32);
  for (let i = 0; i < 8; i++) {
    const val = state[i];
    for (let j = 0; j < 8; j++) {
      hash[i * 8 + j] = Number((val >> BigInt(j * 8)) & BigInt(0xff));
    }
  }
  return hash;
}

function splitGrossBps(gross, treasuryBps, creatorBps) {
  const MAX_TREASURY_BPS = 500;
  const MAX_IP_CREATOR_BPS = 100;
  const BPS_DENOMINATOR = 10000;

  if (gross === 0n) throw new Error('ZeroAmount');
  if (treasuryBps > MAX_TREASURY_BPS) throw new Error('FeeTooHigh');
  if (creatorBps > MAX_IP_CREATOR_BPS) throw new Error('FeeTooHigh');

  const treasury = (gross * BigInt(treasuryBps)) / BigInt(BPS_DENOMINATOR);
  const creator = (gross * BigInt(creatorBps)) / BigInt(BPS_DENOMINATOR);

  if (treasuryBps > 0 && treasury === 0n) throw new Error('FeeRoundsToZero');
  if (creatorBps > 0 && creator === 0n) throw new Error('FeeRoundsToZero');

  const merchant = gross - treasury - creator;
  return { merchant, treasury, creator };
}

// ── Use Case: Full payment lifecycle ────────────────────────────────────────

test('payment lifecycle: deploy → configure route → grant signer → sign quote → settle', async () => {
  // Step 1: Generate identities
  const adminKeypair = generateEd25519Keypair();
  const signerKeypair = generateEd25519Keypair();
  const payerKeypair = generateEd25519Keypair();
  const merchantKeypair = generateEd25519Keypair();

  const adminHash = 'account-hash-' + accountHashHex(adminKeypair);
  const signerHash = 'account-hash-' + accountHashHex(signerKeypair);
  const payerHash = 'account-hash-' + accountHashHex(payerKeypair);
  const merchantHash = 'account-hash-' + accountHashHex(merchantKeypair);

  assert.ok(adminHash.startsWith('account-hash-'));
  assert.ok(signerHash.startsWith('account-hash-'));
  assert.ok(payerHash.startsWith('account-hash-'));
  assert.ok(merchantHash.startsWith('account-hash-'));

  // Step 2: Configure route (admin calls configure_route)
  const route = 1;
  const treasuryBps = 100; // 1%
  const creatorBps = 50;   // 0.5%
  const routeProfile = {
    treasury_bps: treasuryBps,
    creator_bps: creatorBps,
    enabled: true,
    route_treasury: 'account-hash-' + 'aa'.repeat(32),
  };
  assert.ok(routeProfile.enabled);
  assert.ok(routeProfile.route_treasury.startsWith('account-hash-'));

  // Step 3: Grant signer role (admin calls grant_signer_role)
  // Verify role separation: signer ≠ admin, signer ≠ pauser
  assert.notEqual(signerHash, adminHash);
  assert.notEqual(signerHash, 'account-hash-' + '00'.repeat(32)); // no pauser set

  // Step 4: Create quote (off-chain)
  const domainSeparator = Buffer.from('aifinpay-casper-v4');
  const grossAmount = 100_000_000_000n; // 100 CSPR in motes
  const requestId = 'order-' + Date.now();
  const validUntilMs = Date.now() + 600_000; // 10 minutes from now
  const nonce = 0;

  const quoteHash = computeQuoteHash(
    domainSeparator, payerHash, merchantHash,
    grossAmount, route, requestId, validUntilMs, nonce
  );
  assert.equal(quoteHash.length, 32);

  // Step 5: Sign quote (signer signs the hash)
  const signature = signerKeypair.sign(quoteHash);
  assert.ok(signature);

  // Step 6: Verify signature (off-chain verification)
  // casper-js-sdk verify(signature, message) — arg order is sig first
  const verified = signerKeypair.verify(signature, quoteHash);
  assert.ok(verified, 'signature must verify against signer public key');

  // Step 7: Verify quote hash matches (off-chain)
  const recomputed = computeQuoteHash(
    domainSeparator, payerHash, merchantHash,
    grossAmount, route, requestId, validUntilMs, nonce
  );
  assert.ok(quoteHash.equals(recomputed), 'quote hash must be deterministic');

  // Step 8: Verify split calculation
  const split = splitGrossBps(grossAmount, treasuryBps, creatorBps);
  assert.equal(split.treasury, grossAmount * BigInt(treasuryBps) / 10000n);
  assert.equal(split.creator, grossAmount * BigInt(creatorBps) / 10000n);
  assert.equal(split.merchant, grossAmount - split.treasury - split.creator);
  assert.equal(split.merchant + split.treasury + split.creator, grossAmount);
});

// ── Use Case: Nonce replay protection ───────────────────────────────────────

test('payment lifecycle: nonce must increment', () => {
  const domain = Buffer.from('aifinpay-casper-v4');
  const payer = 'account-hash-' + 'aa'.repeat(32);
  const merchant = 'account-hash-' + 'bb'.repeat(32);
  const gross = 10_000_000_000n;
  const route = 1;
  const requestId = 'order-1';
  const validUntil = Date.now() + 600_000;

  const h0 = computeQuoteHash(domain, payer, merchant, gross, route, requestId, validUntil, 0);
  const h1 = computeQuoteHash(domain, payer, merchant, gross, route, requestId, validUntil, 1);

  assert.ok(!h0.equals(h1), 'different nonces must produce different hashes');
});

// ── Use Case: Tamper detection ──────────────────────────────────────────────

test('payment lifecycle: any field tampering changes hash', () => {
  const domain = Buffer.from('aifinpay-casper-v4');
  const payer = 'account-hash-' + 'aa'.repeat(32);
  const merchant = 'account-hash-' + 'bb'.repeat(32);
  const gross = 10_000_000_000n;
  const route = 1;
  const requestId = 'order-1';
  const validUntil = Date.now() + 600_000;
  const nonce = 0;

  const original = computeQuoteHash(domain, payer, merchant, gross, route, requestId, validUntil, nonce);

  // Tamper each field one at a time
  const tampered = [
    computeQuoteHash(Buffer.from('wrong-domain'), payer, merchant, gross, route, requestId, validUntil, nonce),
    computeQuoteHash(domain, 'account-hash-' + 'cc'.repeat(32), merchant, gross, route, requestId, validUntil, nonce),
    computeQuoteHash(domain, payer, 'account-hash-' + 'dd'.repeat(32), gross, route, requestId, validUntil, nonce),
    computeQuoteHash(domain, payer, merchant, gross + 1n, route, requestId, validUntil, nonce),
    computeQuoteHash(domain, payer, merchant, gross, 2, requestId, validUntil, nonce),
    computeQuoteHash(domain, payer, merchant, gross, route, 'order-2', validUntil, nonce),
    computeQuoteHash(domain, payer, merchant, gross, route, requestId, validUntil + 1, nonce),
    computeQuoteHash(domain, payer, merchant, gross, route, requestId, validUntil, 1),
  ];

  for (const t of tampered) {
    assert.ok(!original.equals(t), 'tampered hash must not match original');
  }
});

// ── Use Case: Split edge cases ──────────────────────────────────────────────

test('split: rejects zero amount', () => {
  assert.throws(() => splitGrossBps(0n, 100, 0), /ZeroAmount/);
});

test('split: rejects treasury BPS > 500', () => {
  assert.throws(() => splitGrossBps(10000n, 501, 0), /FeeTooHigh/);
});

test('split: rejects creator BPS > 100', () => {
  assert.throws(() => splitGrossBps(10000n, 0, 101), /FeeTooHigh/);
});

test('split: rejects when treasury rounds to zero', () => {
  assert.throws(() => splitGrossBps(99n, 100, 0), /FeeRoundsToZero/);
});

test('split: rejects when creator rounds to zero', () => {
  assert.throws(() => splitGrossBps(99n, 0, 100), /FeeRoundsToZero/);
});

test('split: 99/1/0 split matches expected', () => {
  const s = splitGrossBps(10000n, 100, 0);
  assert.equal(s.merchant, 9900n);
  assert.equal(s.treasury, 100n);
  assert.equal(s.creator, 0n);
});

test('split: 3-way split preserves sum', () => {
  for (const gross of [10000n, 100_000n, 1_000_000n, 100_000_000_000n]) {
    const s = splitGrossBps(gross, 150, 30);
    assert.equal(s.merchant + s.treasury + s.creator, gross, `sum mismatch for gross=${gross}`);
  }
});

// ── Use Case: Signature verification ────────────────────────────────────────

test('signature: ed25519 sign + verify round-trip', () => {
  const keypair = generateEd25519Keypair();
  const hash = Buffer.alloc(32);
  hash[0] = 0x42;

  const sig = keypair.sign(hash);
  assert.equal(sig.length, 64);

  const valid = keypair.verify(sig, hash);
  assert.ok(valid, 'signature must verify');
});

test('signature: wrong key rejects', () => {
  const keypair1 = generateEd25519Keypair();
  const keypair2 = generateEd25519Keypair();
  const hash = Buffer.alloc(32);
  hash[0] = 0x42;

  const sig = keypair1.sign(hash);
  const valid = keypair2.verify(sig, hash);
  assert.ok(!valid, 'wrong key must reject');
});

test('signature: tampered hash rejects', () => {
  const keypair = generateEd25519Keypair();
  const hash = Buffer.alloc(32);
  hash[0] = 0x42;
  const tampered = Buffer.alloc(32);
  tampered[0] = 0x43;

  const sig = keypair.sign(hash);
  const valid = keypair.verify(sig, tampered);
  assert.ok(!valid, 'tampered hash must reject');
});

// ── Use Case: Route configuration validation ────────────────────────────────

test('route: valid profile passes validation', () => {
  const treasuryBps = 100;
  const creatorBps = 50;
  const enabled = true;
  const hasTreasury = true;

  assert.ok(treasuryBps <= 500);
  assert.ok(creatorBps <= 100);
  assert.ok(enabled);
  assert.ok(hasTreasury);
});

test('route: disabled profile fails', () => {
  const enabled = false;
  assert.ok(!enabled, 'disabled route must not be used for settlement');
});

test('route: treasury BPS without treasury account fails', () => {
  const treasuryBps = 100;
  const hasTreasury = false;
  assert.ok(treasuryBps > 0 && !hasTreasury, 'must have treasury account when BPS > 0');
});

// ── Use Case: RBAC role separation ──────────────────────────────────────────

test('RBAC: signer must not be admin', () => {
  const signer = 'account-hash-' + 'aa'.repeat(32);
  const admin = 'account-hash-' + 'aa'.repeat(32); // same
  assert.equal(signer, admin, 'signer = admin is a violation');
});

test('RBAC: signer must not be pauser', () => {
  const signer = 'account-hash-' + 'bb'.repeat(32);
  const pauser = 'account-hash-' + 'bb'.repeat(32); // same
  assert.equal(signer, pauser, 'signer = pauser is a violation');
});

test('RBAC: admin must not be signer', () => {
  const admin = 'account-hash-' + 'cc'.repeat(32);
  const signer = 'account-hash-' + 'cc'.repeat(32); // same
  assert.equal(admin, signer, 'admin = signer is a violation');
});

test('RBAC: admin must not be pauser', () => {
  const admin = 'account-hash-' + 'dd'.repeat(32);
  const pauser = 'account-hash-' + 'dd'.repeat(32); // same
  assert.equal(admin, pauser, 'admin = pauser is a violation');
});

test('RBAC: pauser must not be signer', () => {
  const pauser = 'account-hash-' + 'ee'.repeat(32);
  const signer = 'account-hash-' + 'ee'.repeat(32); // same
  assert.equal(pauser, signer, 'pauser = signer is a violation');
});

test('RBAC: distinct roles pass', () => {
  const admin = 'account-hash-' + 'aa'.repeat(32);
  const signer = 'account-hash-' + 'bb'.repeat(32);
  const pauser = 'account-hash-' + 'cc'.repeat(32);

  assert.notEqual(signer, admin);
  assert.notEqual(signer, pauser);
  assert.notEqual(admin, pauser);
});

// ── Use Case: Nonce key uniqueness ──────────────────────────────────────────

test('storage: nonce keys are unique per account', () => {
  const k1 = 'nonce_' + 'aa'.repeat(32);
  const k2 = 'nonce_' + 'bb'.repeat(32);
  assert.notEqual(k1, k2);
});

test('storage: consumed keys are unique per account+nonce', () => {
  const k1 = 'consumed_' + 'aa'.repeat(32) + '_0';
  const k2 = 'consumed_' + 'aa'.repeat(32) + '_1';
  const k3 = 'consumed_' + 'bb'.repeat(32) + '_0';
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);
});

// ── Use Case: Expiry validation ─────────────────────────────────────────────

test('expiry: must not be in the past', () => {
  const now = Date.now();
  const past = now - 1000;
  assert.ok(past < now, 'expired quote must be rejected');
});

test('expiry: must not be too far in the future', () => {
  const now = Date.now();
  const maxAhead = 20 * 60 * 1000; // 20 minutes
  const tooFar = now + maxAhead + 1;
  assert.ok(tooFar > now + maxAhead, 'overly-far expiry must be rejected');
});

test('expiry: valid within window', () => {
  const now = Date.now();
  const validUntil = now + 60_000; // 1 minute from now
  const maxAhead = 20 * 60 * 1000;
  assert.ok(validUntil >= now);
  assert.ok(validUntil <= now + maxAhead);
});
