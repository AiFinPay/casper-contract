/**
 * keygen-mainnet.js — generate a fresh, dedicated Ed25519 keypair for Casper MAINNET.
 * Separate from the testnet demo key (wallet isolation: mainnet gets its own key).
 * Run once: node scripts/keygen-mainnet.js
 * Then fund the account with real CSPR (buy on an exchange, withdraw to the public key).
 */

const path = require('path');
const { generateKeys } = require('../lib/keygen');

const DEMO_DIR = path.join(__dirname, '..', 'demo');
const KEYS_DIR = path.join(DEMO_DIR, 'keys-mainnet');
generateKeys(KEYS_DIR, { label: 'MAINNET' });

console.log('');
console.log('⚠️  Fund with real CSPR, then run: node scripts/deploy-mainnet.js');
