/**
 * Reading one transaction straight from Studio Next: the JSON a write
 * returned (a case id, a decision id, a payable write's refusal) and the
 * contract's sentence for a refused write. Nothing is inferred; it is the
 * leader's receipt, decoded.
 */
import { RPC_URL } from "./chain";

type Raw = Record<string, unknown>;

export async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (data.error) throw new Error(String(data.error.message ?? `${method} refused`));
  return data.result;
}

export async function fetchTx(hash: string): Promise<Raw> {
  const tx = (await rpc("eth_getTransactionByHash", [hash])) as Raw | null;
  if (!tx) throw new Error("The network does not know this transaction.");
  return tx;
}

export function leaderRow(tx: Raw): Raw | undefined {
  const rows = ((tx.consensus_data as { leader_receipt?: Raw[] } | undefined)?.leader_receipt ?? []) as Raw[];
  return rows.find((r) => r.mode !== "validator") ?? rows[0];
}

/** The text a leader receipt carries: base64, one tag byte first. */
export function decodeResult(result: unknown): string {
  if (typeof result !== "string") return "";
  try {
    const bytes = Uint8Array.from(atob(result), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return Array.from(text, (c) => (c.charCodeAt(0) < 0x20 ? " " : c)).join("").trim();
  } catch {
    return "";
  }
}

/** The JSON a successful write returned, decoded from its receipt. */
export function returnedJsonOf<T>(tx: Raw): T | null {
  const text = decodeResult(leaderRow(tx)?.result);
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j < i) return null;
  try {
    return JSON.parse(text.slice(i, j + 1)) as T;
  } catch {
    return null;
  }
}

export async function returnedJson<T>(hash: string): Promise<T | null> {
  return returnedJsonOf<T>(await fetchTx(hash));
}

/** The contract's sentence for a refused write, without the marker. */
export function refusalOf(tx: Raw): string {
  const text = decodeResult(leaderRow(tx)?.result);
  return (text.split("[EXPECTED]").pop() ?? text).trim();
}

/** A round that reaches no majority still finalizes, but records nothing. */
export function consensusAgreed(resultName: unknown): boolean {
  return resultName === "MAJORITY_AGREE" || resultName === "AGREE";
}
