/**
 * keygen.js — generate a fresh Ed25519 keypair for Casper testnet.
 * Run once: node scripts/keygen.js
 * Then fund the account at https://testnet.cspr.live/tools/faucet
 */

const path = require('path');
const { generateKeys } = require('../lib/keygen');

const DEMO_DIR = path.join(__dirname, '..', 'demo');
const KEYS_DIR = path.join(DEMO_DIR, 'keys');
const keypair = generateKeys(KEYS_DIR, { label: 'testnet' });

if (!require('fs').existsSync(path.join(KEYS_DIR, 'secret_key.pem'))) {
  console.log('');
  console.log('⚠️  Fund this account with testnet CSPR before deploying:');
  console.log('   https://testnet.cspr.live/tools/faucet');
  console.log('');
  console.log('   Paste account hash above → click "Request tokens"');
  console.log('   Wait ~2 minutes → then run: node scripts/deploy.js');
}
