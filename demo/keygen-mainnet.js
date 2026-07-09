/**
 * keygen-mainnet.js — generate a fresh, dedicated Ed25519 keypair for Casper MAINNET.
 * Separate from the testnet demo key (wallet isolation: mainnet gets its own key).
 * Run once: node keygen-mainnet.js
 * Then fund the account with real CSPR (buy on an exchange, withdraw to the public key).
 */

const { Keys } = require('casper-js-sdk');
const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.join(__dirname, 'keys-mainnet');

if (fs.existsSync(path.join(KEYS_DIR, 'secret_key.pem'))) {
    const existing = Keys.Ed25519.loadKeyPairFromPrivateFile(
        path.join(KEYS_DIR, 'secret_key.pem')
    );
    console.log('✅ Mainnet keypair already exists');
    console.log('Public key  :', existing.publicKey.toHex());
    console.log('Account hash:', existing.publicKey.toAccountHashStr());
    process.exit(0);
}

fs.mkdirSync(KEYS_DIR, { recursive: true });

const keypair = Keys.Ed25519.new();

fs.writeFileSync(path.join(KEYS_DIR, 'secret_key.pem'), keypair.exportPrivateKeyInPem());
fs.writeFileSync(path.join(KEYS_DIR, 'public_key.pem'), keypair.exportPublicKeyInPem());
fs.writeFileSync(path.join(KEYS_DIR, 'public_key_hex.txt'), keypair.publicKey.toHex());

console.log('✅ New MAINNET keypair generated and saved to ./keys-mainnet/');
console.log('');
console.log('Public key  (fund THIS — it is the withdrawal/deposit address):');
console.log('   ' + keypair.publicKey.toHex());
console.log('');
console.log('Account hash:', keypair.publicKey.toAccountHashStr());
console.log('');
console.log('⚠️  Fund with real CSPR, then run: node deploy-mainnet.js');
