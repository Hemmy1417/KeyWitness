/**
 * The transactions behind a case, found on the Studio Next explorer. The
 * contract cannot know its own transaction hashes, so the app looks them up:
 * it pages through the contract's transactions, newest first, and keeps
 * those whose decoded calldata names the case. Each one is then verifiable
 * on the explorer and through the RPC. When the explorer cannot be reached,
 * or the search stops before it has covered the case, the page says so
 * rather than inventing a hash or implying the list is whole.
 *
 * The explorer's paged list is /api/transactions?search=<address> (checked
 * 4 October 2026). Its /api/address/<address> endpoint returns only the 50
 * newest transactions and ignores paging, so it is not used here.
 */
import { abi } from "genlayer-js";

import { EXPLORER } from "./chain";
import { leaderRow, refusalOf, returnedJsonOf } from "./txresult";

/**
 * What a transaction did, read from its own consensus record:
 *   recorded   the validators agreed and the contract executed it
 *   refused    the validators agreed that the contract refused it
 *   undecided  the validators reached no decision, so nothing was written
 *   unknown    still in flight, or the explorer row does not say
 */
export type TxOutcome = "recorded" | "refused" | "undecided" | "unknown";

export interface FoundTx {
  hash: string;
  method: string;
  status: string;
  from: string;
  createdAt: string;
  outcome: TxOutcome;
  /** The contract's own sentence when it refused. */
  reason: string;
}

const SETTLED = ["ACCEPTED", "FINALIZED"];

/**
 * A transaction that reached no majority is later stored as FINALIZED, with
 * a leader receipt that reads like a success. Only its consensus rounds say
 * that nothing was recorded, so the outcome is read from them: the last round
 * that is a decision (not a leader rotation, not an appeal that failed) must
 * be "Accepted".
 */
export function outcomeOf(tx: ExplorerTx): { outcome: TxOutcome; reason: string } {
  const status = String(tx.status ?? "").toUpperCase();
  if (status === "UNDETERMINED") return { outcome: "undecided", reason: "" };
  if (!SETTLED.includes(status)) return { outcome: "unknown", reason: "" };
  const rounds = (tx.consensus_history?.consensus_results ?? []).map((r) => String(r.consensus_round ?? ""));
  const decisions = rounds.filter((r) => r && r !== "Leader Rotation" && !/Appeal Failed$/.test(r));
  const last = decisions[decisions.length - 1];
  if (!last) return { outcome: "unknown", reason: "" };
  if (last !== "Accepted") return { outcome: "undecided", reason: "" };
  const raw = tx as unknown as Record<string, unknown>;
  const leader = leaderRow(raw);
  if (!leader) return { outcome: "unknown", reason: "" };
  const execution = String(leader.execution_result ?? "");
  if (execution !== "SUCCESS" && execution !== "FINISHED_WITH_RETURN") return { outcome: "refused", reason: refusalOf(raw) };
  const returned = returnedJsonOf<{ refused?: boolean; reason?: string }>(raw);
  if (returned?.refused === true) return { outcome: "refused", reason: String(returned.reason ?? "") };
  return { outcome: "recorded", reason: "" };
}

export interface CaseTransactions {
  found: FoundTx[];
  /** The search reached transactions older than the case, or the end of the list. */
  complete: boolean;
  /** How many of the contract's transactions were looked at, and how many it has. */
  scanned: number;
  total: number;
}

/** Method name and arguments from GenVM calldata (base64), or null when it is not a call. */
export function decodeCall(b64: unknown): { method: string; args: unknown[] } | null {
  if (typeof b64 !== "string" || !b64) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const decoded = abi.calldata.decode(bytes) as unknown;
    const obj = decoded instanceof Map ? Object.fromEntries(decoded as Map<string, unknown>) : (decoded as Record<string, unknown>);
    const method = String(obj?.method ?? obj?.[""] ?? "");
    const args = Array.isArray(obj?.args) ? (obj.args as unknown[]) : [];
    return method ? { method, args } : null;
  } catch {
    return null;
  }
}

export interface ExplorerTx {
  hash?: string;
  status?: string;
  from_address?: string;
  created_at?: string;
  data?: { calldata?: string };
  consensus_data?: { leader_receipt?: Record<string, unknown>[] };
  consensus_history?: { consensus_results?: { consensus_round?: string }[] };
}

export interface ExplorerPage {
  transactions?: ExplorerTx[];
  pagination?: { page?: number; total?: number; totalPages?: number };
}

export const PAGE_SIZE = 20;

/**
 * Walk the pages a fetcher serves and keep the transactions that name the
 * case. Pure apart from the fetcher, so the walk is tested without a network.
 * `since` is when the case was opened: once a page holds a transaction older
 * than that, nothing further back can concern the case.
 */
export async function collectCaseTransactions(fetchPage: (page: number) => Promise<ExplorerPage>, caseId: string,
  opts: { since?: string; maxPages?: number } = {}): Promise<CaseTransactions> {
  const maxPages = opts.maxPages ?? 6;
  const since = opts.since ? Date.parse(opts.since) : NaN;
  const seen = new Set<string>();
  const found: FoundTx[] = [];
  let scanned = 0;
  let total = 0;
  let complete = false;
  for (let page = 1; page <= maxPages; page++) {
    const body = await fetchPage(page);
    const rows = body.transactions ?? [];
    total = Number(body.pagination?.total ?? total) || total;
    let older = false;
    for (const tx of rows) {
      if (!tx.hash || seen.has(tx.hash)) continue;
      seen.add(tx.hash);
      scanned += 1;
      const at = tx.created_at ? Date.parse(tx.created_at) : NaN;
      // A minute of slack: the explorer's clock and the contract's are not the same clock.
      if (!Number.isNaN(since) && !Number.isNaN(at) && at < since - 60_000) {
        older = true;
        continue;
      }
      const call = decodeCall(tx.data?.calldata);
      if (!call) continue;
      // open_case carries no case id (the contract assigns it); every later act names the case.
      if (call.args.some((a) => typeof a === "string" && a.toUpperCase() === caseId.toUpperCase())) {
        found.push({ hash: tx.hash, method: call.method, status: String(tx.status ?? ""), from: String(tx.from_address ?? ""),
          createdAt: String(tx.created_at ?? ""), ...outcomeOf(tx) });
      }
    }
    const pages = Number(body.pagination?.totalPages ?? 0);
    if (older || rows.length === 0 || (pages > 0 && page >= pages)) {
      complete = true;
      break;
    }
  }
  return { found, complete, scanned, total: Math.max(total, scanned) };
}

export function caseTransactions(contract: string, caseId: string, since?: string): Promise<CaseTransactions> {
  return collectCaseTransactions(async (page) => {
    const res = await fetch(`${EXPLORER}/api/transactions?search=${contract}&page=${page}&limit=${PAGE_SIZE}`,
      { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`The explorer answered ${res.status}.`);
    return (await res.json()) as ExplorerPage;
  }, caseId, { since });
}
