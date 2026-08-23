/**
 * deploy-mainnet.js — install canonical AiFinPay settlement v3 on Casper MAINNET.
 *
 * This script is fail-closed: it requires an explicit treasury account-hash,
 * a clean reviewed git commit, real mainnet confirmation, and records the
 * deployment as deployed_unverified. It never marks a payment route verified
 * or live; paid E2E evidence is a separate release gate.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env.mainnet') });
const { DeployUtil, Keys, RuntimeArgs, CLValueBuilder } = require('casper-js-sdk');
const fetch = require('node-fetch');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');

const NODE_URL     = process.env.NODE_URL     || 'https://node.mainnet.cspr.cloud/rpc';
const CSPR_API_KEY = process.env.CSPR_API_KEY || '';
const NETWORK      = process.env.NETWORK_NAME || 'casper';
const KEYS_DIR     = process.env.KEYS_DIR     || path.join(__dirname, 'keys-mainnet');
const WASM_PATH    = path.join(__dirname, '..', 'target', 'wasm32-unknown-unknown', 'release', 'aifinpay_casper.wasm');
const MANIFEST_PATH = path.join(__dirname, '..', 'deployments', 'casper-v3.json');
const GAS_INSTALL  = process.env.GAS_INSTALL  || '200000000000'; // 200 CSPR
const TREASURY_ACCOUNT_HASH = process.env.TREASURY_ACCOUNT_HASH || '';

const ACCOUNT_HASH_RE = /^account-hash-[0-9a-f]{64}$/i;
const COMMIT_RE = /^[0-9a-f]{40}$/i;

function git(args) {
    return execFileSync('git', args, { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
}

function reviewedSourceCommit() {
    const dirty = git(['status', '--porcelain']);
    if (dirty) throw new Error('Refusing deployment from a dirty working tree');
    const head = git(['rev-parse', 'HEAD']);
    const expected = process.env.SOURCE_COMMIT || head;
    if (!COMMIT_RE.test(expected) || expected.toLowerCase() !== head.toLowerCase()) {
        throw new Error(`SOURCE_COMMIT must equal the checked-out reviewed HEAD (${head})`);
    }
    return head;
}

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
            const er = result.execution_info && result.execution_info.execution_result;
            if (er && er.Version2) {
                if (er.Version2.error_message) throw new Error(`install failed: ${er.Version2.error_message}`);
                return result;
            }
            if (er && er.Version1) {
                if (er.Version1.Failure) throw new Error(`install failed: ${er.Version1.Failure.error_message || 'unknown'}`);
                if (er.Version1.Success) return result;
            }
        } catch (error) {
            if (/install failed/.test(error.message || '')) throw error;
        }
        await new Promise(r => setTimeout(r, 5000));
        process.stdout.write('.');
    }
    throw new Error('Deploy timed out');
}

async function main() {
    if (process.env.ALLOW_MAINNET_DEPLOY !== 'I_UNDERSTAND_THIS_SPENDS_REAL_CSPR') {
        throw new Error('Set ALLOW_MAINNET_DEPLOY=I_UNDERSTAND_THIS_SPENDS_REAL_CSPR for an intentional mainnet install');
    }
    if (!ACCOUNT_HASH_RE.test(TREASURY_ACCOUNT_HASH)) {
        throw new Error('TREASURY_ACCOUNT_HASH must be an explicit formatted account-hash-<64 hex> value');
    }

    const sourceCommit = reviewedSourceCommit();
    const keyPath = path.join(KEYS_DIR, 'secret_key.pem');
    if (!fs.existsSync(keyPath)) throw new Error('No mainnet keypair found in KEYS_DIR');
    const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(keyPath);
    const adminAccountHash = keypair.publicKey.toAccountHashStr();
    if (adminAccountHash.toLowerCase() === TREASURY_ACCOUNT_HASH.toLowerCase()) {
        console.warn('⚠️ Admin and treasury are the same account. This is allowed by the contract but should be an explicit governance decision.');
    }

    if (!fs.existsSync(WASM_PATH)) throw new Error(`Wasm not found at ${WASM_PATH}`);
    const wasm = new Uint8Array(fs.readFileSync(WASM_PATH));
    const wasmSha256 = crypto.createHash('sha256').update(wasm).digest('hex');

    const status = await rpc('info_get_status', {});
    if (status.chainspec_name !== NETWORK) {
        throw new Error(`Connected chain "${status.chainspec_name}" != expected "${NETWORK}"`);
    }
    await rpc('state_get_account_info', { public_key: keypair.publicKey.toHex() });

    console.log('AiFinPay Casper settlement v3 mainnet deployment');
    console.log('sourceCommit=', sourceCommit);
    console.log('admin=', adminAccountHash);
    console.log('treasury=', TREASURY_ACCOUNT_HASH);
    console.log('wasmSha256=', wasmSha256);

    const deployParams = new DeployUtil.DeployParams(keypair.publicKey, NETWORK, 1, 1800000);
    const session = DeployUtil.ExecutableDeployItem.newModuleBytes(
        wasm,
        RuntimeArgs.fromMap({ treasury: CLValueBuilder.string(TREASURY_ACCOUNT_HASH) }),
    );
    const payment = DeployUtil.standardPayment(GAS_INSTALL);
    const deploy  = DeployUtil.makeDeploy(deployParams, session, payment);
    const signed  = DeployUtil.signDeploy(deploy, keypair);

    const result = await putDeploy(signed);
    const deployHash = result.deploy_hash;
    console.log('Deploy hash:', deployHash);
    console.log('Explorer:', `https://cspr.live/deploy/${deployHash}`);
    await waitForDeploy(deployHash);

    const accountResult = await rpc('state_get_account_info', { public_key: keypair.publicKey.toHex() });
    const contractKey = accountResult.account.named_keys.find(k => k.name === 'aifinpay_casper_v3_hash');
    const versionKey = accountResult.account.named_keys.find(k => k.name === 'aifinpay_casper_v3_version');
    if (!contractKey || !versionKey) {
        throw new Error('v3 named keys not found after successful install');
    }
    const contractHash = contractKey.key;

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const deployedAt = new Date().toISOString();
    const updated = {
        ...manifest,
        contractVersion: '3.0.0-rc.1',
        status: 'deployed_unverified',
        contractHash,
        deployHash,
        wasmSha256,
        sourceCommit,
        treasuryAccountHash: TREASURY_ACCOUNT_HASH,
        adminAccountHash,
        deployedAt,
        verifiedAt: null,
        e2eEvidence: null,
    };
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(updated, null, 2) + '\n');

    fs.writeFileSync(path.join(__dirname, '.env.mainnet.out'),
        `NODE_URL=${NODE_URL}\nNETWORK_NAME=${NETWORK}\nKEYS_DIR=./keys-mainnet\nCONTRACT_HASH=${contractHash}\nTREASURY_ACCOUNT_HASH=${TREASURY_ACCOUNT_HASH}\nSOURCE_COMMIT=${sourceCommit}\n`
    );

    console.log('Contract hash:', contractHash);
    console.log('Manifest updated:', MANIFEST_PATH);
    console.log('STATUS=deployed_unverified — DO NOT unpause or enable payments yet.');
    console.log('Next: independent manifest review + config readback + paid AIFP-1/AIFP-2 E2E + replay/expiry negatives.');
}

main().catch(err => {
    console.error('\n❌', err.message || err);
    process.exit(1);
});
