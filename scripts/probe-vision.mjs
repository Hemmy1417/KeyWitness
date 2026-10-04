/**
 * Probe which validator routes on Studio Next receive images. Deploys
 * probes/vision_probe.py, sends one sample image as JFIF JPEG and as PNG, with
 * and without a JSON answer, and prints every node's model and raw answer.
 * Disposable: never run against a deployment of record.
 *
 *   node scripts/probe-vision.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createAccount, createClient } from "genlayer-js";

import { chain, leaderOf, loadKeys, plainFees, rpc, waitStatus } from "./lib.mjs";

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const op = createClient({ chain, account: createAccount(loadKeys().OPERATOR.pk) });
const code = readFileSync(at("../probes/vision_probe.py"), "utf-8");
const jpeg = readFileSync(at("../fixtures/sample/manager-ceiling.jpg"));
// The same picture as a PNG, made with the Python the repository already needs.
const pngPath = at("../.data/probe-ceiling.png");
mkdirSync(at("../.data/"), { recursive: true });
execFileSync("python", ["-c", `from PIL import Image; Image.open(r"${at("../fixtures/sample/manager-ceiling.jpg")}").resize((800, 533)).save(r"${pngPath}", "PNG", optimize=True)`]);
const png = readFileSync(pngPath);
console.log(`jpeg ${jpeg.length} bytes, png ${png.length} bytes`);

const deploy = await op.deployContract({ code, args: [], fees: await plainFees(op) });
const dt = await waitStatus(deploy, { until: ["ACCEPTED", "FINALIZED"], label: "deploy", every: 2000 });
const address = dt.data?.contract_address;
console.log(`probe contract ${address} (${leaderOf(dt)?.execution_result})`);

const out = [];
// node scripts/probe-vision.mjs --image <file> [--times n]: send one given image instead, n times each way.
const given = process.argv.indexOf("--image");
const times = Number(process.argv[process.argv.indexOf("--times") + 1]) || 1;
const runs = given > 0
  ? Array.from({ length: times }, (_, i) => [[`given-json-${i + 1}`, readFileSync(process.argv[given + 1]), true], [`given-plain-${i + 1}`, readFileSync(process.argv[given + 1]), false]]).flat()
  : [["jpeg-json", jpeg, true], ["png-json", png, true], ["jpeg-plain", jpeg, false], ["png-plain", png, false]];
for (const [label, data, asJson] of runs) {
  const hash = await op.writeContract({ address, functionName: "look", args: [label, new Uint8Array(data), asJson], value: 0n, fees: await plainFees(op) });
  const t = await waitStatus(hash, { until: ["ACCEPTED", "FINALIZED", "UNDETERMINED"], label, every: 2500 });
  const full = (await rpc("eth_getTransactionByHash", [hash])).result;
  const rows = [...(full?.consensus_data?.leader_receipt ?? []), ...(full?.consensus_data?.validators ?? [])];
  console.log(`\n== ${label}: ${t.status} ${hash}`);
  for (const r of rows) {
    const model = `${r?.node_config?.primary_model?.provider ?? ""}/${r?.node_config?.primary_model?.model ?? "?"}`;
    const line = String(r?.genvm_result?.stdout ?? "").split("\n").find((l) => l.includes("[PROBE]")) ?? "(no output)";
    console.log(`  ${model.padEnd(46)} ${line.slice(0, 260)}`);
    out.push({ label, model, line });
  }
}
writeFileSync(at(`../.data/probe-vision-${Date.now()}.json`), JSON.stringify(out, null, 2));
