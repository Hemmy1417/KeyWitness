/** Chain settings and a JSON-RPC transport shared by every KeyWitness script. */
import { studioDevnet } from "genlayer-js/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const RPC = process.env.GENLAYER_RPC_URL ?? "https://studio-dev.genlayer.com/api";
export const CHAIN_ID = 61997;
export const chain = {
  ...studioDevnet,
  id: CHAIN_ID,
  name: "GenLayer Studio Next",
  rpcUrls: { default: { http: [RPC] } },
};
export const EXPLORER = "https://explorer-studio-dev.genlayer.com";
export const GEN = 10n ** 18n;
export const FEE_FLOOR = 10n ** 15n;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const KEYS_PATH = fileURLToPath(new URL("../.data/keys.json", import.meta.url));
export const loadKeys = () => JSON.parse(readFileSync(KEYS_PATH, "utf-8"));

/**
 * One JSON-RPC call with retries for transient failures. Studio Next refuses
 * requests without a browser-like User-Agent and rate-limits reads, so both
 * are handled here rather than in every caller.
 */
export async function rpc(method, params) {
  let last;
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 keywitness-scripts" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const text = await res.text();
      if (text.trimStart().startsWith("<")) throw new Error(`HTTP ${res.status} returned html`);
      const json = JSON.parse(text);
      if (json?.error?.code === -32029 || /rate limit/i.test(json?.error?.message ?? "")) {
        await sleep(20000);
        continue;
      }
      return json;
    } catch (e) {
      last = e;
      await sleep(3000 * (i + 1));
    }
  }
  throw last ?? new Error(`${method}: still rate limited`);
}

export const txOf = async (hash) => (await rpc("eth_getTransactionByHash", [hash])).result;
export const lifecycleOf = async (hash) => (await rpc("gen_getTransactionLifecycle", [{ txId: hash }])).result;

/** The leader's receipt among the round's receipts. */
export function leaderOf(t) {
  const rows = t?.consensus_data?.leader_receipt ?? [];
  return rows.find((r) => r?.mode !== "validator") ?? rows[0];
}

/** Wait until the stored status reaches one of `until` (FINALIZED by default). */
export async function waitStatus(hash, { until = ["FINALIZED"], tries = 200, every = 3000, label = "tx" } = {}) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    await sleep(every);
    const t = await txOf(hash);
    const status = t?.status ?? t?.statusName;
    if (status !== last) {
      console.log(`  ${label}: ${status}`);
      last = status;
    }
    if (until.includes(status)) return t;
    if (status === "CANCELED") throw new Error(`${label} was canceled`);
  }
  throw new Error(`${label}: no ${until.join("/")} after ${(tries * every) / 1000} s`);
}

/** Plain fees for a write that sends no value out of the contract. */
export async function plainFees(client) {
  const est = await client.estimateTransactionFees();
  return { distribution: est.distribution, feeValue: est.feeValue > FEE_FLOOR ? est.feeValue : FEE_FLOOR };
}
