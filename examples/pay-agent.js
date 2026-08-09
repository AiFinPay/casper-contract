/**
 * Example: settle a payment between two registered agents.
 *
 * Execution: reviewed payer-session Wasm, which funds a temporary purse and
 * calls pay_agent(from_agent, to_agent, amount, request_id) atomically.
 * Emits:       PaymentSettled  (immutable, permanent, verifiable on cspr.live)
 *
 * `request_id` makes settlement idempotent — replaying the same request_id
 * is rejected (User(102)), so a payment can never be double-settled.
 *
 * Run:  node examples/pay-agent.js
 */
import { config } from 'dotenv';
config();

const CONTRACT_HASH = process.env.CONTRACT_HASH;

//   const deploy = buildPaySessionDeploy({
//     publicKey: keyPair.publicKey, network: 'casper-test', sessionWasm,
//     contractHash: CONTRACT_HASH, fromAgent: 'agent-001',
//     toAgent: 'provider-001', amountMotes: '2500000000',
//     requestId: 'req-' + Date.now(),
//   });
//   const hash = await casperClient.putDeploy(deploy.sign([keyPair]));
//   console.log('PaymentSettled tx:', `https://testnet.cspr.live/deploy/${hash}`);

console.log('Contract:', CONTRACT_HASH);
console.log('See ../demo/agent-compute-demo.js for the full runnable settlement flow.');
