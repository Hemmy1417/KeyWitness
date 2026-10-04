/**
 * Deploy contracts/keywitness.py to Studio Next and prove the deployment runs
 * exactly that source: the network's stored code is fetched back and its
 * sha256 compared with the file's. Then two reads confirm it answers.
 *
 *   node scripts/deploy.mjs                a disposable deployment (label "dev")
 *   node scripts/deploy.mjs --label proofs  another disposable one
 *   node scripts/deploy.mjs --record        the deployment of record: also writes
 *                                           deployments/record.json and web/lib/config.ts
 *
 * Signs with the OPERATOR key from .data/keys.json (gitignored). Prints
 * addresses and hashes only, never a key.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createAccount, createClient } from "genlayer-js";

import { chain, CHAIN_ID, EXPLORER, leaderOf, loadKeys, plainFees, rpc, waitStatus } from "./lib.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const record = process.argv.includes("--record");
const label = record ? "record" : (arg("--label") ?? "dev");
const at = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const source = readFileSync(at("../contracts/keywitness.py"));
const sourceSha = createHash("sha256").update(source).digest("hex");
console.log(`source sha256 ${sourceSha} (${source.length} bytes)`);

const op = createClient({ chain, account: createAccount(loadKeys().OPERATOR.pk) });
const hash = await op.deployContract({ code: source.toString("utf-8"), args: [], fees: await plainFees(op) });
console.log(`deploy tx ${hash}`);
const accepted = await waitStatus(hash, { until: ["ACCEPTED", "FINALIZED"], label: "deploy", every: 2000 });
const execution = leaderOf(accepted)?.execution_result;
if (execution !== "SUCCESS" && execution !== "FINISHED_WITH_RETURN") throw new Error(`the deploy executed as ${execution}`);
const address = accepted?.data?.contract_address ?? accepted?.to_address;
if (!/^0x[0-9a-fA-F]{40}$/.test(String(address))) throw new Error("the deploy returned no contract address");
console.log(`contract ${address}`);
const final = await waitStatus(hash, { until: ["FINALIZED"], label: "deploy", every: 3000 });

// The code the network stores, back out, byte for byte.
const stored = (await rpc("gen_getContractCode", [address])).result;
const text = typeof stored === "string" ? stored : (stored?.code ?? "");
const asBytes = /^[A-Za-z0-9+/=\s]+$/.test(text) && !text.includes("Depends") ? Buffer.from(text, "base64") : Buffer.from(text, "utf-8");
const storedSha = createHash("sha256").update(asBytes).digest("hex");
if (storedSha !== sourceSha) throw new Error(`stored code sha256 ${storedSha} differs from the source ${sourceSha}`);
console.log(`stored code matches the source (sha256 ${storedSha})`);

const config = JSON.parse(await op.readContract({ address, functionName: "get_config", args: [] }));
const stats = JSON.parse(await op.readContract({ address, functionName: "get_stats", args: [] }));
if (config.rules !== "keywitness-rules-1" || stats.case !== "0") throw new Error("the new deployment answered unexpectedly");
console.log(`reads ok: rules ${config.rules}, deployer ${config.deployer}`);

const out = {
  label, network: "GenLayer Studio Next", chain_id: CHAIN_ID, contract: address, deploy_tx: hash,
  deploy_status: final?.status, deployer: config.deployer, source: "contracts/keywitness.py", source_sha256: sourceSha,
  stored_code_sha256: storedSha, explorer: `${EXPLORER}/address/${address}`, deployed_at: new Date().toISOString(),
};
mkdirSync(at("../.data/deployments/"), { recursive: true });
writeFileSync(at(`../.data/deployments/${label}.json`), JSON.stringify(out, null, 2) + "\n");
if (record) {
  mkdirSync(at("../deployments/"), { recursive: true });
  writeFileSync(at("../deployments/record.json"), JSON.stringify(out, null, 2) + "\n");
  const cfgPath = at("../web/lib/config.ts");
  const cfg = readFileSync(cfgPath, "utf-8")
    .replace(/export const RECORD_ADDRESS: string = "[^"]*";/, `export const RECORD_ADDRESS: string = "${address}";`)
    .replace(/export const SOURCE_SHA256: string = "[^"]*";/, `export const SOURCE_SHA256: string = "${sourceSha}";`);
  writeFileSync(cfgPath, cfg);
  console.log("wrote deployments/record.json and web/lib/config.ts");
}
console.log(JSON.stringify(out, null, 2));
