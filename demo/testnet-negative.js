const { DeployUtil, Keys, CLValueBuilder, RuntimeArgs, CLByteArray } = require("casper-js-sdk");
const fs = require("fs");
const NODE = process.env.NODE_URL || "https://node.testnet.casper.network/rpc";
// Key directories are supplied by the operator and are never committed.
const BUYER_KEYS = process.env.BUYER_KEYS || "keys-testnet-fresh";
const PROVIDER_KEYS = process.env.PROVIDER_KEYS || "keys";
const NETWORK = "casper-test";
const CONTRACT = process.env.CONTRACT_HASH_HEX || "4ac265aaa769acdf28d95f34fa91a267b8e5671b661c73ff4b7c5959c80c7fae";
const WASM = new Uint8Array(fs.readFileSync(process.env.SESSION_WASM));
const GAS = "8000000000";

async function rpc(m, p) {
  const r = await fetch(NODE, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
  return r.json();
}
async function balance(pk) {
  const sr = (await rpc("chain_get_state_root_hash", [])).result.state_root_hash;
  const ai = await rpc("state_get_account_info", { public_key: pk });
  const b = await rpc("state_get_balance", { state_root_hash: sr, purse_uref: ai.result.account.main_purse });
  return BigInt(b.result.balance_value);
}
async function run(kp, { from, to, amount, req }) {
  const args = RuntimeArgs.fromMap({
    contract_hash: new CLByteArray(Uint8Array.from(Buffer.from(CONTRACT, "hex"))),
    from_agent: CLValueBuilder.string(from),
    to_agent: CLValueBuilder.string(to),
    amount: CLValueBuilder.u512(amount),
    request_id: CLValueBuilder.string(req),
  });
  const d = DeployUtil.makeDeploy(new DeployUtil.DeployParams(kp.publicKey, NETWORK),
    DeployUtil.ExecutableDeployItem.newModuleBytes(WASM, args), DeployUtil.standardPayment(GAS));
  const res = await rpc("account_put_deploy", DeployUtil.deployToJson(DeployUtil.signDeploy(d, kp)));
  if (res.error) return { ok: false, reason: "put rejected" };
  const h = res.result.deploy_hash;
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const info = await rpc("info_get_deploy", { deploy_hash: h });
    const ei = info.result?.execution_info;
    if (!ei?.execution_result) continue;
    const v2 = ei.execution_result.Version2;
    return v2?.error_message ? { ok: false, reason: v2.error_message, h } : { ok: true, h };
  }
  return { ok: false, reason: "timeout" };
}

(async () => {
  const buyer    = Keys.Ed25519.parseKeyFiles(`${BUYER_KEYS}/public_key.pem`, `${BUYER_KEYS}/secret_key.pem`);
  const provider = Keys.Ed25519.parseKeyFiles(`${PROVIDER_KEYS}/public_key.pem`, `${PROVIDER_KEYS}/secret_key.pem`);
  const A1 = "buyer-v2-test", A2 = "provider-v2-test";
  const N = Date.now();
  const cases = [
    ["REPLAY of the settled request_id", buyer,    { from: A1, to: A2, amount: "2500000000", req: "req-session-1785869353055" }],
    ["FORGED payer (provider claims to be buyer)", provider, { from: A1, to: A2, amount: "2500000000", req: `neg-forge-${N}` }],
    ["ZERO amount",                      buyer,    { from: A1, to: A2, amount: "0",          req: `neg-zero-${N}` }],
    ["SELF payment",                     buyer,    { from: A1, to: A1, amount: "2500000000", req: `neg-self-${N}` }],
    ["UNREGISTERED recipient",           buyer,    { from: A1, to: "ghost-agent", amount: "2500000000", req: `neg-ghost-${N}` }],
    ["MALFORMED request_id",             buyer,    { from: A1, to: A2, amount: "2500000000", req: "bad id!!<>" }],
  ];
  const p0 = await balance(provider.publicKey.toHex());
  console.log("provider before negatives:", (Number(p0)/1e9).toFixed(4), "\n");
  for (const [label, kp, args] of cases) {
    const r = await run(kp, args);
    console.log(`${r.ok ? "❌ ACCEPTED" : "✅ REJECTED"}  ${label}`);
    console.log(`     ${r.ok ? "deploy " + r.h : (r.reason||"").slice(0, 90)}`);
  }
  const p1 = await balance(provider.publicKey.toHex());
  console.log("\nprovider after negatives:", (Number(p1)/1e9).toFixed(4));
  console.log("value moved by any negative case:", (Number(p1-p0)/1e9).toFixed(4), "CSPR");
})();
