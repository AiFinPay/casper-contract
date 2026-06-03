/**
 * deploy.js — install the AiFinPay settlement contract on Casper testnet.
 * Pre-requisites:
 *   1. node keygen.js  (generates keys)
 *   2. Fund account at https://testnet.cspr.live/tools/faucet
 *   3. Build Wasm: cd .. && cargo build --release
 *
 * Run: node deploy.js
 * Output: CONTRACT_HASH to paste in .env
 */

require('dotenv').config();
const { CasperClient, DeployUtil, Keys, RuntimeArgs } = require('casper-js-sdk');
const fs = require('fs');
const path = require('path');

const NODE_URL    = process.env.NODE_URL    || 'http://rpc.testnet.casperlabs.io:7777';
const NETWORK     = process.env.NETWORK_NAME || 'casper-test';
const KEYS_DIR    = process.env.KEYS_DIR    || path.join(__dirname, 'keys');
const WASM_PATH   = path.join(__dirname, '..', 'target', 'wasm32-unknown-unknown', 'release', 'aifinpay_casper.wasm');

const GAS_INSTALL = '200000000000'; // 200 CSPR

async function main() {
    // Load keypair
    const keyPath = path.join(KEYS_DIR, 'secret_key.pem');
    if (!fs.existsSync(keyPath)) {
        console.error('❌ No keypair found. Run: node keygen.js');
        process.exit(1);
    }
    const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(keyPath);
    console.log('🔑 Deployer:', keypair.publicKey.toAccountHashStr());

    // Load Wasm
    if (!fs.existsSync(WASM_PATH)) {
        console.error('❌ Wasm not found. Run: cd .. && cargo build --release');
        process.exit(1);
    }
    const wasm = new Uint8Array(fs.readFileSync(WASM_PATH));
    console.log(`📦 Wasm size: ${(wasm.length / 1024).toFixed(1)} KB`);

    const client = new CasperClient(NODE_URL);

    // Build deploy
    const deployParams = new DeployUtil.DeployParams(
        keypair.publicKey,
        NETWORK,
        1,       // gasPrice
        1800000  // TTL ms
    );
    const session = DeployUtil.ExecutableDeployItem.newModuleBytes(wasm, RuntimeArgs.fromMap({}));
    const payment = DeployUtil.standardPayment(GAS_INSTALL);
    const deploy  = DeployUtil.makeDeploy(deployParams, session, payment);
    const signed  = client.signDeploy(deploy, keypair);

    console.log('\n🚀 Submitting deploy to testnet...');
    const deployHash = await client.putDeploy(signed);
    console.log('✅ Deploy hash:', deployHash);
    console.log('🔗 Explorer:  ', `https://testnet.cspr.live/deploy/${deployHash}`);

    // Wait for inclusion
    console.log('\n⏳ Waiting for execution (~60s)...');
    const result = await waitForDeploy(client, deployHash);
    const execResult = result[1].execution_results[0]?.result;

    if (execResult?.Failure) {
        console.error('❌ Deploy failed:', execResult.Failure.error_message);
        process.exit(1);
    }

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
    console.log('📝 Add to .env:');
    console.log(`   CONTRACT_HASH=${contractHash}`);

    // Save to file
    fs.appendFileSync('.env', `\nCONTRACT_HASH=${contractHash}\n`);
}

async function waitForDeploy(client, deployHash, maxWait = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const result = await client.getDeploy(deployHash);
            if (result[1].execution_results.length > 0) return result;
        } catch (_) {}
        await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('Deploy timed out after 2 minutes');
}

main().catch(err => {
    console.error('❌', err.message || err);
    process.exit(1);
});
