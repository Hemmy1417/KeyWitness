/**
 * The building blocks every live script uses: one signed client per role,
 * writes that wait for the network and decode what the contract returned or
 * why it refused, views, and the ledger check that the contract's balance
 * equals what its own books say it holds.
 */
import { createAccount, createClient } from "genlayer-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chain, FEE_FLOOR, leaderOf, loadKeys, rpc, sleep } from "./lib.mjs";

export const ROLES = ["OPERATOR", "CLAIMANT", "RESPONDENT", "INSPECTOR", "STRANGER", "SECOND"];

export function wallets() {
  const keys = loadKeys();
  const out = {};
  for (const role of ROLES) {
    const account = createAccount(keys[role].pk);
    out[role] = { role, addr: account.address, client: createClient({ chain, account }) };
  }
  return out;
}

/** The text a leader receipt carries: base64 with a leading tag byte. */
export function resultText(receipt) {
  const res = receipt?.result;
  return typeof res === "string" ? Buffer.from(res, "base64").toString("utf-8").replace(/[\x00-\x1f]/g, " ").trim() : "";
}

export function returnedJson(receipt) {
  const text = resultText(receipt);
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j < i) return null;
  try {
    return JSON.parse(text.slice(i, j + 1));
  } catch {
    return null;
  }
}

const STALL_MS = 8 * 60 * 1000;

/** Wait for one of `until`. UNDETERMINED and CANCELED end the wait with that status. */
export async function waitFor(hash, { until = ["ACCEPTED", "FINALIZED"], label = "tx", maxMs = 20 * 60 * 1000 } = {}) {
  const started = Date.now();
  let last = null;
  let since = Date.now();
  while (Date.now() - started < maxMs) {
    await sleep(2500);
    const t = (await rpc("eth_getTransactionByHash", [hash])).result;
    const status = t?.status ?? t?.statusName;
    if (status !== last) {
      last = status;
      since = Date.now();
    } else if (Date.now() - since > STALL_MS) {
      const lc = (await rpc("gen_getTransactionLifecycle", [{ txId: hash }])).result;
      if (lc?.resolutionAction === "NoOp" && !lc?.decisionActive) {
        const err = new Error(`${label}: the network stalled it in ${status}`);
        err.stalled = true;
        err.tx = t;
        throw err;
      }
      since = Date.now();
    }
    if (until.includes(status) || status === "UNDETERMINED" || status === "CANCELED") return t;
  }
  throw new Error(`${label}: no ${until.join("/")} after ${maxMs / 60000} minutes`);
}

async function fees(client, { address, functionName, args, value, transfer }) {
  if (transfer) {
    // The simulation runs the write to find the transfers it must budget for.
    // A write the contract would refuse moves nothing, so the simulation fails
    // with "execution failed"; that write goes out on plain fees and its
    // refusal is recorded on chain like any other.
    let est = null;
    try {
      est = await client.estimateTransactionFeesForWrite({ address, functionName, args, value });
    } catch (e) {
      if (!/execution failed/i.test(`${e?.details ?? ""} ${e?.message ?? e}`)) throw e;
    }
    if (est) {
      if (!est.messageAllocations?.length) throw new Error("the fee simulation returned no message allocations");
      return { distribution: est.distribution, feeValue: est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR,
        messageAllocations: est.messageAllocations };
    }
  }
  const est = await client.estimateTransactionFees();
  return { distribution: est.distribution, feeValue: est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR };
}

/**
 * Send one write and wait. Returns the hash, the stored status, the
 * consensus result, the leader's execution result, and the contract's
 * returned JSON or its refusal text.
 */
export async function write(who, address, functionName, args = [], { value = 0n, until = ["ACCEPTED", "FINALIZED"] } = {}) {
  const transfer = functionName === "withdraw";
  let hash;
  for (let i = 0; i < 4; i++) {
    try {
      hash = await who.client.writeContract({ address, functionName, args, value,
        fees: await fees(who.client, { address, functionName, args, value, transfer }) });
      break;
    } catch (e) {
      const text = String(e?.message ?? e);
      if (i === 3 || !/nonce|rate|429|timeout|fetch/i.test(text)) throw e;
      await sleep(5000 * (i + 1));
    }
  }
  const t = await waitFor(hash, { until, label: `${who.role} ${functionName}` });
  const leader = leaderOf(t);
  const execution = leader?.execution_result ?? "";
  const ok = execution === "SUCCESS" || execution === "FINISHED_WITH_RETURN";
  return {
    hash, method: functionName, by: who.role, status: t?.status, consensus: t?.result_name ?? "", execution, ok,
    returned: ok ? returnedJson(leader) : null,
    refusal: ok ? "" : (resultText(leader).split("[EXPECTED]").pop() ?? "").trim(),
  };
}

export async function view(client, address, functionName, args = []) {
  for (let i = 0; i < 6; i++) {
    try {
      const raw = await client.readContract({ address, functionName, args });
      return typeof raw === "string" && /^[[{]/.test(raw) ? JSON.parse(raw) : raw;
    } catch (e) {
      const text = String(e?.message ?? e);
      if (i === 5 || !/rate|429|-32029|timeout|fetch|busy/i.test(text)) throw e;
      await sleep(8000 * (i + 1));
    }
  }
  return null;
}

/** The contract's balance on chain against held + bonds + owed in its own books. */
export async function ledger(client, address) {
  const stats = await view(client, address, "get_stats");
  const books = BigInt(stats.held_wei) + BigInt(stats.bonds_wei) + BigInt(stats.owed_wei);
  const balance = BigInt((await rpc("eth_getBalance", [address, "latest"])).result ?? "0x0");
  return { balance, books, equal: balance === books, stats };
}

/** The synthetic sample: its terms and evidence as files on disk. */
export function sample() {
  const dir = new URL("../fixtures/sample/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf-8"));
  return {
    ...manifest,
    bytes: (file) => readFileSync(fileURLToPath(new URL(file, dir))),
    text: (file) => readFileSync(fileURLToPath(new URL(file, dir)), "utf-8").replace(/\n$/, ""),
  };
}

/** File one manifest item on a case as the given wallet. */
export async function fileItem(who, address, cid, item, s = sample()) {
  const meta = { file_name: item.file, description: item.description ?? "", declared_capture: item.declared_capture ?? "",
    criteria: item.criteria ?? [], ...(item.doc_type ? { doc_type: item.doc_type } : {}), ...(item.title ? { title: item.title } : {}) };
  if (item.kind === "TEXT_DOCUMENT") {
    return write(who, address, "submit_text", [cid, JSON.stringify(meta), s.text(item.file)]);
  }
  return write(who, address, "submit_image", [cid, JSON.stringify({ ...meta, kind: item.kind }), new Uint8Array(s.bytes(item.file))]);
}

/** Every node's model, vote and what it printed, for each consensus round of a transaction. */
export async function rounds(hash) {
  const t = (await rpc("eth_getTransactionByHash", [hash])).result;
  const list = t?.consensus_history?.consensus_results?.length
    ? t.consensus_history.consensus_results.map((r) => ({ round: r.consensus_round, rows: [...(r.leader_result ?? []), ...(r.validator_results ?? [])] }))
    : [{ round: "final", rows: [...(t?.consensus_data?.leader_receipt ?? []), ...(t?.consensus_data?.validators ?? [])] }];
  return {
    status: t?.status, consensus: t?.result_name ?? "", appealed: t?.appealed === true,
    rounds: list.map((r) => ({
      round: r.round,
      nodes: r.rows.map((x) => {
        const out = String(x?.genvm_result?.stdout ?? "");
        const assess = out.split("\n").find((l) => l.includes("[ASSESS]")) ?? "";
        const dissent = out.split("\n").find((l) => l.includes("[DISSENT]")) ?? "";
        let sighted = null;
        try {
          sighted = JSON.parse(assess.slice(assess.indexOf("{"))).sighted ?? null;
        } catch {
          sighted = null;
        }
        return {
          mode: x?.mode ?? "", vote: x?.vote ?? "", execution: x?.execution_result ?? "",
          model: `${x?.node_config?.primary_model?.provider ?? ""}/${x?.node_config?.primary_model?.model ?? "?"}`,
          sighted, dissent: dissent.replace(/^.*\[DISSENT\]\s*/, "").slice(0, 160),
        };
      }),
    })),
  };
}

/**
 * A protocol appeal with the SDK's own calls: price it, then send it. Returns
 * what the network reported, or the reason it could not be sent.
 */
export async function protocolAppeal(who, hash) {
  try {
    const charge = await who.client.getAppealCharge({ txId: hash });
    await who.client.appealTransaction({ txId: hash, value: charge });
    return { sent: true, charge: String(charge) };
  } catch (e) {
    return { sent: false, error: String(e?.shortMessage ?? e?.message ?? e).slice(0, 300) };
  }
}
