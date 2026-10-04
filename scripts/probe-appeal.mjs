/**
 * Probe the protocol appeal path on Studio Next with a disposable contract.
 * Deploys probes/appeal_probe.py, accepts one write, appeals it with the SDK's
 * getAppealCharge + appealTransaction, then checks that the contract code and
 * state survive and that later writes still execute. Writes a JSON receipt to
 * .data/probes/. Never run this against a deployment of record.
 */
import { createAccount, createClient } from "genlayer-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chain, leaderOf, lifecycleOf, loadKeys, plainFees, rpc, sleep, txOf, waitStatus } from "./lib.mjs";

const keys = loadKeys();
const op = createClient({ chain, account: createAccount(keys.OPERATOR.pk) });
const appellant = createClient({ chain, account: createAccount(keys.STRANGER.pk) });
const out = { started: new Date().toISOString(), steps: [] };
const note = (k, v) => { out.steps.push({ k, v }); console.log(k, typeof v === "string" ? v : JSON.stringify(v)); };

const code = readFileSync(fileURLToPath(new URL("../probes/appeal_probe.py", import.meta.url)), "utf-8");
const deployHash = await op.deployContract({ code, args: [], fees: await plainFees(op) });
note("deploy tx", deployHash);
const dt = await waitStatus(deployHash, { until: ["ACCEPTED", "FINALIZED"], label: "deploy", every: 2000 });
const address = dt.data?.contract_address;
note("contract", address);
note("deploy leader", leaderOf(dt)?.execution_result);

const bumpHash = await op.writeContract({ address, functionName: "bump", args: [], value: 0n, fees: await plainFees(op) });
note("bump tx", bumpHash);
// Catch the decision as early as possible: the appeal window is short on Studio Next.
let t;
for (let i = 0; i < 200; i++) {
  await sleep(1000);
  t = await txOf(bumpHash);
  if (["ACCEPTED", "FINALIZED", "UNDETERMINED"].includes(t?.status)) break;
}
note("bump status at decision", t?.status);
const lc1 = await lifecycleOf(bumpHash);
note("lifecycle before appeal", lc1);
let charge;
try {
  charge = await appellant.getAppealCharge({ txId: bumpHash });
  note("appeal charge (atto)", String(charge));
} catch (e) {
  note("getAppealCharge failed", String(e?.message ?? e).slice(0, 400));
}
if (charge !== undefined && t?.status === "ACCEPTED") {
  try {
    const r = await appellant.appealTransaction({ txId: bumpHash, value: charge });
    note("appealTransaction returned", String(r));
  } catch (e) {
    note("appealTransaction failed", String(e?.message ?? e).slice(0, 600));
  }
}
for (let i = 0; i < 90; i++) {
  await sleep(2000);
  const lc = await lifecycleOf(bumpHash);
  const tx = await txOf(bumpHash);
  if (i % 5 === 0) note(`poll ${i}`, { status: tx?.status, stored: lc?.storedStatus, projected: lc?.projectedStatus, action: lc?.resolutionAction, appealed: tx?.appealed, appeal_failed: tx?.appeal_failed });
  if (tx?.status === "FINALIZED") { t = tx; break; }
}
note("final status", t?.status);
note("consensus rounds", (t?.consensus_history?.consensus_results ?? []).map((r) => r?.consensus_round));
note("final leader execution", leaderOf(t)?.execution_result);
const codeAfter = await rpc("gen_getContractCode", [address]);
const raw = typeof codeAfter.result === "string" ? codeAfter.result : (codeAfter.result?.code ?? "");
note("code bytes after appeal", raw.length);
try { note("count after appeal", await op.readContract({ address, functionName: "get", args: [] })); } catch (e) { note("read after appeal failed", String(e?.message ?? e).slice(0, 300)); }
const bump2 = await op.writeContract({ address, functionName: "bump", args: [], value: 0n, fees: await plainFees(op) });
const t2 = await waitStatus(bump2, { until: ["ACCEPTED", "FINALIZED"], label: "bump2", every: 2000 });
note("later write leader execution", leaderOf(t2)?.execution_result);
try { note("count after later write", await op.readContract({ address, functionName: "get", args: [] })); } catch (e) { note("read failed", String(e?.message ?? e).slice(0, 300)); }
mkdirSync(fileURLToPath(new URL("../.data/probes/", import.meta.url)), { recursive: true });
writeFileSync(fileURLToPath(new URL(`../.data/probes/appeal-${Date.now()}.json`, import.meta.url)), JSON.stringify(out, null, 2));
