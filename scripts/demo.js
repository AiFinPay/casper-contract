/**
 * demo.js — full AiFinPay x Casper demo flow:
 *   1. Register AI Agent A (aifinpay-agent-001)
 *   2. Provider self-registers AI Agent B (aifinpay-agent-002)
 *   3. Agent A pays Agent B (settle 2.5 CSPR, request ID: req-001)
 *   4. Query payment count → confirm on-chain
 *
 * Pre-requisites: node scripts/deploy.js completed + CONTRACT_HASH in demo/.env
 * Run: node scripts/demo.js
 */

const DEMO_DIR = require('path').join(__dirname, '..', 'demo');
require('dotenv').config({ path: require('path').join(DEMO_DIR, '.env') });

const { CasperClient, Keys, CLValueBuilder, RuntimeArgs } = require('casper-js-sdk');
const path = require('path');
const { assertTrustedContract } = require('../demo/trusted-contract');
const { loadConfig } = require('../lib/config');
const { callEntry, waitForSuccess, explorer } = require('../lib/casper-helpers');

const cfg = loadConfig(DEMO_DIR, { requireContract: true });
const MOTES_PER_CSPR = 1_000_000_000n;

const PROVIDER_KEYS_DIR = process.env.PROVIDER_KEYS_DIR;
if (!PROVIDER_KEYS_DIR) {
  console.error('❌ PROVIDER_KEYS_DIR is required; buyer and provider must use distinct funded accounts');
  process.exit(1);
}
assertTrustedContract(cfg.contractHash);

async function main() {
  const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(path.join(cfg.keysDir, 'secret_key.pem'));
  const providerKeypair = Keys.Ed25519.loadKeyPairFromPrivateFile(path.join(PROVIDER_KEYS_DIR, 'secret_key.pem'));
  const accountHash = keypair.publicKey.toAccountHashStr();
  const providerHash = providerKeypair.publicKey.toAccountHashStr();
  if (providerHash === accountHash) throw new Error('buyer and provider accounts must be distinct');
  const client = new CasperClient(cfg.nodeUrl);

  console.log('🤖 AiFinPay x Casper — Demo Flow');
  console.log('=================================');
  console.log('Contract:', cfg.contractHash);
  console.log('Caller:  ', accountHash);
  console.log('');

  // ── Step 1: Register Agent A ─────────────────────────────────────────────
  console.log('📝 Step 1: Registering aifinpay-agent-001...');
  const tx1 = await callEntry(client, keypair, cfg.contractHash, cfg.network, 'register_agent', RuntimeArgs.fromMap({
    agent_id: CLValueBuilder.string('aifinpay-agent-001'),
    wallet:   CLValueBuilder.string(accountHash),
  }));
  console.log('   Deploy hash:', tx1);
  console.log('   Explorer:   ', explorer(tx1));
  await waitForSuccess(cfg.nodeUrl, tx1, 'register agent-001');
  console.log('   ✅ Agent A registered\n');

  // ── Step 2: Register Agent B ─────────────────────────────────────────────
  console.log('📝 Step 2: Registering aifinpay-agent-002...');
  const tx2 = await callEntry(client, providerKeypair, cfg.contractHash, cfg.network, 'register_agent', RuntimeArgs.fromMap({
    agent_id: CLValueBuilder.string('aifinpay-agent-002'),
    wallet:   CLValueBuilder.string(providerHash),
  }));
  console.log('   Deploy hash:', tx2);
  console.log('   Explorer:   ', explorer(tx2));
  await waitForSuccess(cfg.nodeUrl, tx2, 'register agent-002');
  console.log('   ✅ Agent B registered\n');

  // ── Step 3: Settle payment ───────────────────────────────────────────────
  const amountMotes = (2n * MOTES_PER_CSPR + 500_000_000n).toString(); // 2.5 CSPR
  console.log(`💸 Step 3: Settling payment — agent-001 → agent-002 (2.5 CSPR, req-001)...`);
  const tx3 = await callEntry(client, keypair, cfg.contractHash, cfg.network, 'pay_agent', RuntimeArgs.fromMap({
    from_agent: CLValueBuilder.string('aifinpay-agent-001'),
    to_agent:   CLValueBuilder.string('aifinpay-agent-002'),
    amount:     CLValueBuilder.u512(amountMotes),
    request_id: CLValueBuilder.string('req-001'),
  }));
  console.log('   Deploy hash:', tx3);
  console.log('   Explorer:   ', explorer(tx3));
  await waitForSuccess(cfg.nodeUrl, tx3, 'pay_agent');
  console.log('   ✅ PaymentSettled event emitted\n');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('🎉 ==========================================');
  console.log('   DEMO COMPLETE — ALL ON-CHAIN');
  console.log('==========================================');
  console.log('');
  console.log('Transaction hashes:');
  console.log('  register agent-001:', tx1);
  console.log('  register agent-002:', tx2);
  console.log('  PaymentSettled:    ', tx3);
  console.log('');
  console.log('View contract state:');
  console.log(`  https://testnet.cspr.live/contract/${cfg.contractHash.replace('hash-', '')}`);
  console.log('');
  console.log('Dashboard: open demo/dashboard.html in your browser');
}

main().catch(err => {
  console.error('❌', err.message || err);
  process.exit(1);
});
