'use strict';

const { Keys } = require('casper-js-sdk');
const fs = require('fs');
const path = require('path');

function generateKeys(keysDir, { label = 'testnet' } = {}) {
  const secretPath = path.join(keysDir, 'secret_key.pem');

  if (fs.existsSync(secretPath)) {
    const existing = Keys.Ed25519.loadKeyPairFromPrivateFile(secretPath);
    console.log(`✅ ${label} keypair already exists`);
    console.log('Public key :', existing.publicKey.toHex());
    console.log('Account hash:', existing.publicKey.toAccountHashStr());
    return existing;
  }

  fs.mkdirSync(keysDir, { recursive: true });

  const keypair = Keys.Ed25519.new();
  fs.writeFileSync(path.join(keysDir, 'secret_key.pem'), keypair.exportPrivateKeyInPem());
  fs.writeFileSync(path.join(keysDir, 'public_key.pem'), keypair.exportPublicKeyInPem());
  fs.writeFileSync(path.join(keysDir, 'public_key_hex.txt'), keypair.publicKey.toHex());

  console.log(`✅ New ${label} keypair generated and saved to ${keysDir}/`);
  console.log('');
  console.log('Public key :', keypair.publicKey.toHex());
  console.log('Account hash:', keypair.publicKey.toAccountHashStr());
  return keypair;
}

module.exports = { generateKeys };
