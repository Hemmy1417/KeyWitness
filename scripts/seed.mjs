/**
 * Run the synthetic sample case on a deployment, start to decision, with the
 * script wallets: the claimant opens it, the respondent accepts and deposits
 * the held sum, both file the sample evidence, both mark it complete, and the
 * claimant asks for the assessment. Prints each step; writes nothing secret.
 *
 *   node scripts/seed.mjs --contract 0x...    (defaults to .data/deployments/dev.json)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fileItem, ledger, sample, view, wallets, write } from "./flows.mjs";

const i = process.argv.indexOf("--contract");
const address = i > 0 ? process.argv[i + 1]
  : JSON.parse(readFileSync(fileURLToPath(new URL(`../.data/deployments/${process.env.KW_LABEL ?? "dev"}.json`, import.meta.url)), "utf-8")).contract;
const w = wallets();
const s = sample();

const step = (r) => {
  console.log(`${r.by.padEnd(10)} ${r.method.padEnd(18)} ${r.status} ${r.consensus} ${r.execution} ${r.hash}`);
  console.log(`           ${r.ok ? JSON.stringify(r.returned) : `REFUSED: ${r.refusal}`}`);
  if (!r.ok) throw new Error(`${r.method} did not execute`);
  if (r.status === "UNDETERMINED") throw new Error(`${r.method}: the validators reached no majority (${r.hash})`);
  return r;
};

const opened = step(await write(w.CLAIMANT, address, "open_case",
  [JSON.stringify({ ...s.terms, respondent: w.RESPONDENT.addr, inspector: "" })]));
const cid = opened.returned.case_id;
const terms = await view(w.STRANGER.client, address, "get_terms", [cid, 1]);
step(await write(w.RESPONDENT, address, "accept_case", [cid, terms.digest]));
step(await write(w.RESPONDENT, address, "fund_case", [cid], { value: BigInt(s.terms.held_sum_wei) }));
for (const item of s.evidence) step(await fileItem(w[item.role], address, cid, item, s));
step(await write(w.CLAIMANT, address, "mark_ready", [cid]));
step(await write(w.RESPONDENT, address, "mark_ready", [cid]));
const assessed = step(await write(w.CLAIMANT, address, "request_assessment", [cid]));
console.log(`case ${cid}: ${JSON.stringify(assessed.returned)}`);
const l = await ledger(w.STRANGER.client, address);
console.log(`ledger: balance ${l.balance} books ${l.books} equal=${l.equal}`);
