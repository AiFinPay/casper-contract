const { DeployUtil, Keys, CLValueBuilder, RuntimeArgs, CLByteArray } = require("casper-js-sdk");
const fs = require("fs");
const NODE = process.env.NODE_URL || "https://node.testnet.casper.network/rpc";
// Key directories are supplied by the operator and are never committed.
const BUYER_KEYS = process.env.BUYER_KEYS || "keys-testnet-fresh";
const PROVIDER_KEYS = process.env.PROVIDER_KEYS || "keys";
const NETWORK = "casper-test";
const CONTRACT = process.env.CONTRACT_HASH_HEX || "4ac265aaa769acdf28d95f34fa91a267b8e5671b661c73ff4b7c5959c80c7fae";
const SESSION_WASM = process.env.SESSION_WASM;
const AMOUNT = "2500000000"; // 2.5 CSPR
const GAS = "8000000000";    // 8 CSPR

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
async function await_deploy(h) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const info = await rpc("info_get_deploy", { deploy_hash: h });
    const ei = info.result?.execution_info;
    if (!ei?.execution_result) { process.stdout.write("."); continue; }
    const v2 = ei.execution_result.Version2;
    if (v2?.error_message) return { ok: false, reason: v2.error_message, block: ei.block_height };
    return { ok: true, block: ei.block_height, cost: v2?.consumed };
  }
  return { ok: false, reason: "timeout" };
}

(async () => {
  const buyer    = Keys.Ed25519.parseKeyFiles(`${BUYER_KEYS}/public_key.pem`, `${BUYER_KEYS}/secret_key.pem`);
  const provider = Keys.Ed25519.parseKeyFiles(`${PROVIDER_KEYS}/public_key.pem`, `${PROVIDER_KEYS}/secret_key.pem`);
  const REQ = "req-session-" + Date.now();

  const b0 = await balance(buyer.publicKey.toHex());
  const p0 = await balance(provider.publicKey.toHex());
  console.log("BEFORE  buyer:", (Number(b0)/1e9).toFixed(4), " provider:", (Number(p0)/1e9).toFixed(4));

  const wasm = new Uint8Array(fs.readFileSync(SESSION_WASM));
  const args = RuntimeArgs.fromMap({
    contract_hash: new CLByteArray(Uint8Array.from(Buffer.from(CONTRACT, "hex"))),
    from_agent: CLValueBuilder.string("buyer-v2-test"),
    to_agent: CLValueBuilder.string("provider-v2-test"),
    amount: CLValueBuilder.u512(AMOUNT),
    request_id: CLValueBuilder.string(REQ),
  });
  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(buyer.publicKey, NETWORK),
    DeployUtil.ExecutableDeployItem.newModuleBytes(wasm, args),
    DeployUtil.standardPayment(GAS));
  const res = await rpc("account_put_deploy", DeployUtil.deployToJson(DeployUtil.signDeploy(deploy, buyer)));
  if (res.error) { console.error("PUT FAILED:", JSON.stringify(res.error).slice(0,200)); process.exit(1); }
  const h = res.result.deploy_hash;
  console.log("session deploy:", h);
  const r = await await_deploy(h);
  console.log(r.ok ? `\nSESSION SUCCESS block ${r.block} gas ${(Number(r.cost)/1e9).toFixed(4)} CSPR`
                   : `\nSESSION FAILED: ${r.reason}`);

  const b1 = await balance(buyer.publicKey.toHex());
  const p1 = await balance(provider.publicKey.toHex());
  console.log("\nAFTER   buyer:", (Number(b1)/1e9).toFixed(4), " provider:", (Number(p1)/1e9).toFixed(4));
  console.log("DELTA   buyer:", (Number(b1-b0)/1e9).toFixed(4), " provider:", (Number(p1-p0)/1e9).toFixed(4));
  console.log("\nPROVIDER RECEIVED EXACTLY 2.5 CSPR:", (p1-p0) === BigInt(AMOUNT) ? "YES ✅" : "NO ❌");
  console.log("REQUEST_ID=" + REQ);
  console.log("SESSION_HASH=" + h);
})();
