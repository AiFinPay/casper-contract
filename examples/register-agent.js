/**
 * Example: register an AI agent on the AiFinPay Casper settlement contract.
 *
 * Entry point: register_agent(agent_id: String, wallet: String)
 * Emits:       AgentRegistered
 *
 * Run:  node examples/register-agent.js
 * (Requires a funded key + CONTRACT_HASH in demo/.env — see examples/README.md)
 */
import { config } from 'dotenv';
config();

const CONTRACT_HASH = process.env.CONTRACT_HASH;
const RPC = process.env.NODE_URL || 'https://node.testnet.casper.network/rpc';

// The full, working implementation lives in ../demo/demo.js and
// ../demo/agent-compute-demo.js. This snippet shows the shape of the call:
//
//   const deploy = buildContractCall(CONTRACT_HASH, 'register_agent', {
//     agent_id: CLValueBuilder.string('agent-001'),
//     wallet:   CLValueBuilder.string(publicKeyHex),
//   });
//   const hash = await casperClient.putDeploy(deploy.sign([keyPair]));
//   console.log('AgentRegistered tx:', hash);

console.log('Contract:', CONTRACT_HASH);
console.log('RPC:', RPC);
console.log('See ../demo/demo.js for the full runnable register_agent flow.');
