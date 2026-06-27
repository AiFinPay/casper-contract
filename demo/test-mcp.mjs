#!/usr/bin/env node
/**
 * test-mcp.mjs — exercises casper-mcp.mjs over real MCP stdio, end to end.
 * Spawns the server as Claude Desktop would, lists tools, then runs
 * request_compute -> settle_on_casper -> get_compute_result with REAL Casper
 * testnet txs. Use this to confirm the agent path works before recording.
 *
 *   node test-mcp.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const T = { timeout: 240000, resetTimeoutOnProgress: true };
const textOf = (r) => (r.content || []).map((c) => c.text).join('\n');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(__dirname, 'casper-mcp.mjs')],
  cwd: __dirname,
  stderr: 'inherit', // surface the server's [casper-mcp] logs
});
const client = new Client({ name: 'casper-mcp-test', version: '1.0.0' }, { capabilities: {} });

await client.connect(transport);

const { tools } = await client.listTools();
console.log('\n=== tools/list ===');
console.log(tools.map((t) => ` • ${t.name}`).join('\n'));

console.log('\n=== 1) request_compute ===');
const r1 = await client.callTool(
  { name: 'request_compute', arguments: { prompt: 'In one sentence: why do autonomous AI agents need an on-chain settlement layer?' } },
  undefined, T,
);
const t1 = textOf(r1);
console.log(t1);
const request_id = (t1.match(/request_id:\s*(\S+)/) || [])[1];
if (!request_id) { console.error('!! could not parse request_id'); process.exit(1); }

console.log('\n=== 2) settle_on_casper ===');
console.log(textOf(await client.callTool({ name: 'settle_on_casper', arguments: { request_id } }, undefined, T)));

console.log('\n=== 3) get_compute_result ===');
console.log(textOf(await client.callTool({ name: 'get_compute_result', arguments: { request_id } }, undefined, T)));

await client.close();
console.log('\n✅ MCP end-to-end OK');
process.exit(0);
