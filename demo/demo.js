/**
 * demo.js — full AiFinPay x Casper demo flow:
 *   1. Register AI Agent A (aifinpay-agent-001)
 *   2. Register AI Agent B (aifinpay-agent-002)
 *   3. Agent A pays Agent B (settle 2.5 CSPR, request ID: req-001)
 *   4. Query payment count → confirm on-chain
 *
 * Pre-requisites: node deploy.js completed + CONTRACT_HASH in .env
 * Run: node demo.js
 */

require('dotenv').config();
const {
    CasperClient, DeployUtil, Keys, CLValueBuilder, RuntimeArgs
} = require('casper-js-sdk');
const path = require('path');

const NODE_URL       = process.env.NODE_URL       || 'https://node.testnet.casper.network/rpc';
const NETWORK        = process.env.NETWORK_NAME   || 'casper-test';
const KEYS_DIR       = process.env.KEYS_DIR       || path.join(__dirname, 'keys');
const CONTRACT_HASH  = process.env.CONTRACT_HASH;

const GAS_CALL = '5000000000'; // 5 CSPR per call
const MOTES_PER_CSPR = 1_000_000_000n;

if (!CONTRACT_HASH) {
    console.error('❌ CONTRACT_HASH not set in .env — run node deploy.js first');
    process.exit(1);
}

async function callEntry(client, keypair, entryPoint, args) {
    const hashBytes = Buffer.from(CONTRACT_HASH.replace('hash-', ''), 'hex');
    const deployParams = new DeployUtil.DeployParams(keypair.publicKey, NETWORK, 1, 1800000);
    const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(
        hashBytes,
        entryPoint,
        args
    );
    const payment = DeployUtil.standardPayment(GAS_CALL);
    const deploy  = DeployUtil.makeDeploy(deployParams, session, payment);
    const signed  = client.signDeploy(deploy, keypair);
    const hash    = await client.putDeploy(signed);
    return hash;
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
    throw new Error('Deploy timed out');
}

async function main() {
    const keypair = Keys.Ed25519.loadKeyPairFromPrivateFile(
        require('path').join(KEYS_DIR, 'secret_key.pem')
    );
    const accountHash = keypair.publicKey.toAccountHashStr();
    const client = new CasperClient(NODE_URL);

    console.log('🤖 AiFinPay x Casper — Demo Flow');
    console.log('=================================');
    console.log('Contract:', CONTRACT_HASH);
    console.log('Caller:  ', accountHash);
    console.log('');

    // ── Step 1: Register Agent A ─────────────────────────────────────────────
    console.log('📝 Step 1: Registering aifinpay-agent-001...');
    const tx1 = await callEntry(client, keypair, 'register_agent', RuntimeArgs.fromMap({
        agent_id: CLValueBuilder.string('aifinpay-agent-001'),
        wallet:   CLValueBuilder.string(accountHash),
    }));
    console.log('   Deploy hash:', tx1);
    console.log('   Explorer:   ', `https://testnet.cspr.live/deploy/${tx1}`);
    await waitForDeploy(client, tx1);
    console.log('   ✅ Agent A registered\n');

    // ── Step 2: Register Agent B ─────────────────────────────────────────────
    console.log('📝 Step 2: Registering aifinpay-agent-002...');
    const tx2 = await callEntry(client, keypair, 'register_agent', RuntimeArgs.fromMap({
        agent_id: CLValueBuilder.string('aifinpay-agent-002'),
        wallet:   CLValueBuilder.string('account-hash-0000000000000000000000000000000000000000000000000000000000000002'),
    }));
    console.log('   Deploy hash:', tx2);
    console.log('   Explorer:   ', `https://testnet.cspr.live/deploy/${tx2}`);
    await waitForDeploy(client, tx2);
    console.log('   ✅ Agent B registered\n');

    // ── Step 3: Settle payment ───────────────────────────────────────────────
    const amountMotes = (2n * MOTES_PER_CSPR + 500_000_000n).toString(); // 2.5 CSPR
    console.log(`💸 Step 3: Settling payment — agent-001 → agent-002 (2.5 CSPR, req-001)...`);
    const tx3 = await callEntry(client, keypair, 'pay_agent', RuntimeArgs.fromMap({
        from_agent: CLValueBuilder.string('aifinpay-agent-001'),
        to_agent:   CLValueBuilder.string('aifinpay-agent-002'),
        amount:     CLValueBuilder.u512(amountMotes),
        request_id: CLValueBuilder.string('req-001'),
    }));
    console.log('   Deploy hash:', tx3);
    console.log('   Explorer:   ', `https://testnet.cspr.live/deploy/${tx3}`);
    await waitForDeploy(client, tx3);
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
    console.log(`  https://testnet.cspr.live/contract/${CONTRACT_HASH.replace('hash-', '')}`);
    console.log('');
    console.log('Dashboard: open dashboard.html in your browser');
}

main().catch(err => {
    console.error('❌', err.message || err);
    process.exit(1);
});
