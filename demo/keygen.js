/**
 * keygen.js — generate a fresh Ed25519 keypair for Casper testnet.
 * Run once: node keygen.js
 * Then fund the account at https://testnet.cspr.live/tools/faucet
 */

const { Keys } = require('casper-js-sdk');
const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.join(__dirname, 'keys');

if (fs.existsSync(path.join(KEYS_DIR, 'secret_key.pem'))) {
    const existing = Keys.Ed25519.loadKeyPairFromPrivateFile(
        path.join(KEYS_DIR, 'secret_key.pem')
    );
    console.log('✅ Keypair already exists');
    console.log('Public key :', existing.publicKey.toHex());
    console.log('Account hash:', existing.publicKey.toAccountHashStr());
    process.exit(0);
}

fs.mkdirSync(KEYS_DIR, { recursive: true });

const keypair = Keys.Ed25519.new();

fs.writeFileSync(path.join(KEYS_DIR, 'secret_key.pem'), keypair.exportPrivateKeyInPem());
fs.writeFileSync(path.join(KEYS_DIR, 'public_key.pem'), keypair.exportPublicKeyInPem());
fs.writeFileSync(path.join(KEYS_DIR, 'public_key_hex.txt'), keypair.publicKey.toHex());

console.log('✅ New keypair generated and saved to ./keys/');
console.log('');
console.log('Public key :', keypair.publicKey.toHex());
console.log('Account hash:', keypair.publicKey.toAccountHashStr());
console.log('');
console.log('⚠️  Fund this account with testnet CSPR before deploying:');
console.log('   https://testnet.cspr.live/tools/faucet');
console.log('');
console.log('   Paste account hash above → click "Request tokens"');
console.log('   Wait ~2 minutes → then run: node deploy.js');
