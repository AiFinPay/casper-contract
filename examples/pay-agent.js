/**
 * Example: settle a payment between two registered agents.
 *
 * Entry point: pay_agent(from_agent, to_agent, amount: U512, request_id)
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

//   const deploy = buildContractCall(CONTRACT_HASH, 'pay_agent', {
//     from_agent: CLValueBuilder.string('agent-001'),
//     to_agent:   CLValueBuilder.string('provider-001'),
//     amount:     CLValueBuilder.u512(2_500_000_000), // 2.5 CSPR in motes
//     request_id: CLValueBuilder.string('req-' + Date.now()),
//   });
//   const hash = await casperClient.putDeploy(deploy.sign([keyPair]));
//   console.log('PaymentSettled tx:', `https://testnet.cspr.live/deploy/${hash}`);

console.log('Contract:', CONTRACT_HASH);
console.log('See ../demo/agent-compute-demo.js for the full runnable settlement flow.');
