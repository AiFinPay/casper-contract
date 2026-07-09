/**
 * deploy-mainnet.js — install the AiFinPay settlement contract on Casper MAINNET.
 *
 * Same logic as deploy.js but targets the live network:
 *   NETWORK  = 'casper'   (mainnet chain name, vs 'casper-test')
 *   NODE_URL = mainnet RPC (override via .env.mainnet if needed)
 *   keys     = ./keys-mainnet/   (dedicated mainnet key, not the testnet demo key)
 *   explorer = https://cspr.live  (vs testnet.cspr.live)
 *
 * Requires the mainnet account to be funded with real CSPR first (~250 CSPR).
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env.mainnet') });
const { DeployUtil, Keys, RuntimeArgs } = require('casper-js-sdk');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Mainnet defaults — override in .env.mainnet if the cspr.cloud key isn't mainnet-enabled.
const NODE_URL     = process.env.NODE_URL     || 'https://node.mainnet.cspr.cloud/rpc';
const CSPR_API_KEY = process.env.CSPR_API_KEY || '';
const NETWORK      = process.env.NETWORK_NAME || 'casper';
const KEYS_DIR     = process.env.KEYS_DIR     || path.join(__dirname, 'keys-mainnet');
const WASM_PATH    = path.join(__dirname, '..', 'aifinpay_casper.wasm');
const GAS_INSTALL  = process.env.GAS_INSTALL  || '200000000000'; // 200 CSPR

async function rpc(method, params) {
    const headers = { 'Content-Type': 'application/json' };
    if (CSPR_API_KEY) headers['Authorization'] = CSPR_API_KEY;
    const res = await fetch(NODE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
    return data.result;
}

async function putDeploy(deploy) {
    return rpc('account_put_deploy', DeployUtil.deployToJson(deploy));
}

async function waitForDeploy(deployHash, maxWait = 240000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const result = await rpc('info_get_deploy', { deploy_hash: deployHash });
            if (result.execution_results && result.execution_results.length > 0) return result;
        } catch (_) {}
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('.');
    }
    throw new Error('Deploy timed out');
}

async function main() {
    const keyPath = path.join(KEYS_DIR, 'secret_key.pem');
    if (!fs.existsSync(keyPath)) {
        console.error('❌ No mainnet keypair found. Run: node keygen-mainnet.js');
        process.exit(1);
    }
    const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(keyPath);
    console.log('🔑 Deployer (mainnet):', keypair.publicKey.toHex());
    console.log('   Account hash       :', keypair.publicKey.toAccountHashStr());

    if (!fs.existsSync(WASM_PATH)) {
        console.error('❌ Wasm not found at:', WASM_PATH);
        process.exit(1);
    }
    const wasm = new Uint8Array(fs.readFileSync(WASM_PATH));
    console.log(`📦 Wasm: ${(wasm.length / 1024).toFixed(1)} KB`);

    // Verify connection + that we're really on mainnet
    const status = await rpc('info_get_status', {});
    console.log(`🌐 Connected: ${status.chainspec_name} | Block: ${status.last_added_block_info.height}`);
    if (status.chainspec_name !== NETWORK) {
        console.error(`❌ Connected chain "${status.chainspec_name}" != expected "${NETWORK}". Aborting.`);
        process.exit(1);
    }

    // Confirm the account is funded before spending gas
    try {
        const bal = await rpc('state_get_account_info', { public_key: keypair.publicKey.toHex() });
        if (!bal || !bal.account) {
            console.error('❌ Account not on-chain yet — fund it with CSPR and wait a couple minutes.');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Account not found on mainnet — fund it first.', e.message);
        process.exit(1);
    }

    const deployParams = new DeployUtil.DeployParams(keypair.publicKey, NETWORK, 1, 1800000);
    const session = DeployUtil.ExecutableDeployItem.newModuleBytes(wasm, RuntimeArgs.fromMap({}));
    const payment = DeployUtil.standardPayment(GAS_INSTALL);
    const deploy  = DeployUtil.makeDeploy(deployParams, session, payment);
    const signed  = DeployUtil.signDeploy(deploy, keypair);

    console.log('\n🚀 Submitting MAINNET deploy...');
    const result = await putDeploy(signed);
    const deployHash = result.deploy_hash;
    console.log('\n✅ Deploy hash:', deployHash);
    console.log('🔗 Explorer:  ', `https://cspr.live/deploy/${deployHash}`);

    console.log('\n⏳ Waiting for execution');
    const execResult = await waitForDeploy(deployHash);
    const outcome = execResult.execution_results[0]?.result;
    if (outcome?.Failure) {
        console.error('\n❌ Deploy failed:', outcome.Failure.error_message);
        process.exit(1);
    }

    console.log('\n\n🔍 Fetching contract hash from account named keys...');
    const accountResult = await rpc('state_get_account_info', { public_key: keypair.publicKey.toHex() });
    const contractKey = accountResult.account.named_keys.find(k => k.name === 'aifinpay_casper_hash');
    if (!contractKey) {
        console.log('⚠️  Named key not found yet — re-run in 30s. Deploy:', `https://cspr.live/deploy/${deployHash}`);
        process.exit(0);
    }
    const contractHash = contractKey.key;
    console.log('\n🎉 ==========================================');
    console.log('   CONTRACT LIVE ON CASPER MAINNET');
    console.log('==========================================');
    console.log('Deploy hash:  ', deployHash);
    console.log('Contract hash:', contractHash);
    console.log('Explorer:     ', `https://cspr.live/contract/${contractHash.replace('hash-','')}`);

    fs.writeFileSync(path.join(__dirname, '.env.mainnet.out'),
        `NODE_URL=${NODE_URL}\nNETWORK_NAME=${NETWORK}\nKEYS_DIR=./keys-mainnet\nCONTRACT_HASH=${contractHash}\n`
    );
    console.log('\n📝 Saved contract hash to .env.mainnet.out');
}

main().catch(err => {
    console.error('\n❌', err.message || err);
    process.exit(1);
});
