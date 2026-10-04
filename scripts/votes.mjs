/**
 * Every node's model, vote and diagnostic lines for one transaction, across
 * every leader rotation, so a failed consensus can be read rather than
 * guessed at.
 *
 *   node scripts/votes.mjs <tx hash>
 */
import { rpc } from "./lib.mjs";

const hash = process.argv[2];
const t = (await rpc("eth_getTransactionByHash", [hash])).result;
const rounds = t?.consensus_history?.consensus_results?.length
  ? t.consensus_history.consensus_results.map((r) => ({ label: r.consensus_round, leader: r.leader_result ?? [], validators: r.validator_results ?? [] }))
  : [{ label: "final", leader: t?.consensus_data?.leader_receipt ?? [], validators: t?.consensus_data?.validators ?? [] }];
console.log(`tx ${hash} status=${t?.status} result=${t?.result_name} rounds=${rounds.length}`);
rounds.forEach((r, i) => {
  console.log(`round ${i + 1}: ${r.label}`);
  for (const [from, rows] of [["leader", r.leader], ["validator", r.validators]]) {
    for (const x of rows) {
      const model = x?.node_config?.primary_model?.model ?? x?.node_config?.model ?? "?";
      const provider = x?.node_config?.primary_model?.provider ?? x?.node_config?.provider ?? "";
      const out = String(x?.genvm_result?.stdout ?? "");
      const lines = out.split("\n").filter((l) => l.includes("[ASSESS]") || l.includes("[DISSENT]"));
      console.log(`  ${from}/${x?.mode ?? "?"} vote=${x?.vote ?? "?"} exec=${x?.execution_result ?? "?"} model=${provider}/${model}`);
      for (const l of lines) console.log(`     ${l.slice(0, 600)}`);
      if (!lines.length && x?.genvm_result?.stderr) console.log(`     stderr: ${String(x.genvm_result.stderr).slice(0, 300)}`);
    }
  }
});
