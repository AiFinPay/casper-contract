/**
 * deploy.js — install the AiFinPay settlement contract on Casper testnet.
 * Pre-requisites:
 *   1. node scripts/keygen.js  (generates keys)
 *   2. Fund account at https://testnet.cspr.live/tools/faucet
 *   3. Build Wasm: cargo build --release --target wasm32-unknown-unknown
 *
 * Run: node scripts/deploy.js
 * Output: CONTRACT_HASH to paste in demo/.env
 */

const DEMO_DIR = require('path').join(__dirname, '..', 'demo');
require('dotenv').config({ path: require('path').join(DEMO_DIR, '.env') });

const { CasperClient, DeployUtil, Keys, RuntimeArgs } = require('casper-js-sdk');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { loadConfig } = require('../lib/config');
const { explorer, waitForSuccess } = require('../lib/casper-helpers');

const cfg = loadConfig(DEMO_DIR);
const WASM_PATH = path.join(__dirname, '..', 'target', 'wasm32-unknown-unknown', 'release', 'aifinpay_casper.wasm');
const GAS_INSTALL = '200000000000'; // 200 CSPR

async function main() {
  // Load keypair
  const keyPath = path.join(cfg.keysDir, 'secret_key.pem');
  if (!fs.existsSync(keyPath)) {
    console.error('❌ No keypair found. Run: node scripts/keygen.js');
    process.exit(1);
  }
  const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(keyPath);
  console.log('🔑 Deployer:', keypair.publicKey.toAccountHashStr());

  // Load Wasm
  if (!fs.existsSync(WASM_PATH)) {
    console.error('❌ Wasm not found. Run: cargo build --release --target wasm32-unknown-unknown');
    process.exit(1);
  }
  const wasm = new Uint8Array(fs.readFileSync(WASM_PATH));
  const wasmSha256 = crypto.createHash('sha256').update(wasm).digest('hex');
  console.log(`📦 Wasm size: ${(wasm.length / 1024).toFixed(1)} KB`);
  console.log(`🔒 Wasm SHA-256: ${wasmSha256}`);

  const client = new CasperClient(cfg.nodeUrl);

  // Build deploy
  const deployParams = new DeployUtil.DeployParams(keypair.publicKey, cfg.network, 1, 1800000);
  const session = DeployUtil.ExecutableDeployItem.newModuleBytes(wasm, RuntimeArgs.fromMap({}));
  const payment = DeployUtil.standardPayment(GAS_INSTALL);
  const deploy  = DeployUtil.makeDeploy(deployParams, session, payment);
  const signed  = client.signDeploy(deploy, keypair);

  console.log('\n🚀 Submitting deploy to testnet...');
  const deployHash = await client.putDeploy(signed);
  console.log('✅ Deploy hash:', deployHash);
  console.log('🔗 Explorer:  ', explorer(deployHash));

  // Wait for inclusion
  console.log('\n⏳ Waiting for execution (~60s)...');
  await waitForSuccess(cfg.nodeUrl, deployHash, 'install', { maxWait: 120000 });

  // Retrieve contract hash from account named keys
  console.log('\n🔍 Fetching contract hash...');
  const accountInfo = await client.nodeClient.getAccountInfo(keypair.publicKey.toHex());
  const contractKey = accountInfo.namedKeys.find(k => k.name === 'aifinpay_casper_hash');

  if (!contractKey) {
    console.log('⚠️  Contract hash not found in named keys yet. Check explorer link above.');
    process.exit(0);
  }

  const contractHash = contractKey.key;
  console.log('\n🎉 ==========================================');
  console.log('   CONTRACT DEPLOYED ON CASPER TESTNET');
  console.log('==========================================');
  console.log('Contract hash:', contractHash);
  console.log('Explorer:     ', `https://testnet.cspr.live/contract/${contractHash.replace('hash-','')}`);
  console.log('');
  console.log('📝 Add to demo/.env:');
  console.log(`   CONTRACT_HASH=${contractHash}`);

  console.log('Release remains quarantined until deployments/casper-v2.json is independently verified.');
}

main().catch(err => {
  console.error('❌', err.message || err);
  process.exit(1);
});
