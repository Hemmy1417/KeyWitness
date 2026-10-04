/**
 * One deployment, named the same everywhere. Run by CI and before a release:
 *
 *   node scripts/check-address.mjs
 *
 * Checks, from the files in this checkout only (no network):
 *   1. deployments/record.json names a contract and the sha256 of the source it runs
 *   2. contracts/keywitness.py in this checkout has that sha256 (so the source
 *      beside the record is the source that was deployed)
 *   3. web/lib/config.ts carries the same address, the same sha256 and the
 *      sample case the live record ran
 *   4. docs/proofs/live.json is the record of proofs against that address,
 *      finished, with no failed check
 *   5. every address written in README.md, SECURITY.md and docs/*.md is the
 *      contract, its deployer or a wallet from the live record, and the
 *      documents that must name the contract do
 *
 * It does not prove the network still serves that code. scripts/deploy.mjs
 * proved that at deployment, and the status page of the app does it live.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(at(rel), "utf-8");
const problems = [];
const must = (ok, what) => {
  if (!ok) problems.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const same = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

if (!existsSync(at("../deployments/record.json"))) {
  console.log("FAIL there is no deployments/record.json: no deployment of record has been made");
  process.exit(1);
}
const record = JSON.parse(read("../deployments/record.json"));
const address = String(record.contract ?? "");
must(/^0x[0-9a-fA-F]{40}$/.test(address), `the record names a contract address (${address})`);
must(record.chain_id === 61997, `the record is on Studio Next, chain 61997 (${record.chain_id})`);
must(/^[0-9a-f]{64}$/.test(String(record.source_sha256)) && record.source_sha256 === record.stored_code_sha256,
  "the record's stored code sha256 equals its source sha256");

const source = readFileSync(at("../contracts/keywitness.py"));
const sourceSha = createHash("sha256").update(source).digest("hex");
must(sourceSha === record.source_sha256, `contracts/keywitness.py is the deployed source (sha256 ${sourceSha})`);
must(!source.includes(13), "the contract source has no carriage returns (a CRLF checkout would change its sha256)");

const config = read("../web/lib/config.ts");
const constant = (name) => new RegExp(`export const ${name}: string = (?:[A-Z_]+ \\|\\| )?"([^"]*)";`).exec(config)?.[1] ?? "";
must(same(constant("RECORD_ADDRESS"), address), `web/lib/config.ts reads the same contract (${constant("RECORD_ADDRESS")})`);
must(constant("SOURCE_SHA256") === record.source_sha256, "web/lib/config.ts carries the same source sha256");
must(!/github\.com\/OWNER\//.test(config), "web/lib/config.ts links a real repository, not a placeholder");

const known = new Set([address.toLowerCase(), String(record.deployer ?? "").toLowerCase()]);
if (!existsSync(at("../docs/proofs/live.json"))) {
  must(false, "docs/proofs/live.json exists: the live proofs were recorded against the deployment of record");
} else {
  const live = JSON.parse(read("../docs/proofs/live.json"));
  must(same(live.contract, address), `the live proofs ran against the same contract (${live.contract})`);
  must(!!live.finished && live.summary?.failed?.length === 0 && live.summary?.checks > 0,
    `the live proofs finished with no failed check (${live.summary?.passed}/${live.summary?.checks})`);
  const sample = live.steps?.["A.open"]?.returned?.case_id ?? "";
  must(!!sample && constant("SAMPLE_CASE") === sample, `the app's sample case is the one the live record ran (${sample})`);
  for (const w of Object.values(live.wallets ?? {})) known.add(String(w).toLowerCase());
}

const docs = ["../README.md", "../SECURITY.md", ...readdirSync(at("../docs")).filter((f) => f.endsWith(".md")).map((f) => `../docs/${f}`),
  ...(existsSync(at("../docs/proofs")) ? readdirSync(at("../docs/proofs")).filter((f) => f.endsWith(".md")).map((f) => `../docs/proofs/${f}`) : [])];
for (const rel of docs) {
  if (!existsSync(at(rel))) {
    must(false, `${rel.slice(3)} exists`);
    continue;
  }
  const strangers = [...new Set(read(rel).match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? [])].filter((a) => !known.has(a.toLowerCase()));
  must(strangers.length === 0, `${rel.slice(3)} names no address but the contract, its deployer and the proof wallets`
    + (strangers.length ? ` (found ${strangers.join(", ")})` : ""));
}
for (const rel of ["../README.md", "../docs/DEPLOYMENT.md", "../docs/GENLAYER_INTEGRATION.md", "../docs/proofs/live.md"]) {
  must(existsSync(at(rel)) && read(rel).toLowerCase().includes(address.toLowerCase()), `${rel.slice(3)} names the contract`);
}

console.log(problems.length ? `\n${problems.length} problem(s)` : "\none deployment, named the same everywhere");
process.exit(problems.length ? 1 : 0);
