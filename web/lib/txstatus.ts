/**
 * The protocol lifecycle of one transaction, as GenLayer reports it.
 *
 * Statuses are the stored status the consensus contracts materialise (14
 * documented values). Actions are separate: the lifecycle read's
 * `resolutionAction` says what the protocol can do next (for example
 * Finalize), and `Finalize` is never shown as a status. Nothing here is
 * inferred from the app's own state: every field comes from Studio Next.
 *
 * Sources (checked 2 October 2026):
 *   docs.genlayer.com/understand-genlayer-protocol/core-concepts/transactions/transaction-statuses
 *   docs.genlayer.com/api-references/genlayer-node/gen/gen_getTransactionLifecycle
 *   docs.genlayer.com/understand-genlayer-protocol/core-concepts/optimistic-democracy/appeal-process
 */
import { fetchTx, leaderRow, returnedJsonOf, rpc } from "./txresult";

export type StoredStatus =
  | "UNINITIALIZED" | "PENDING" | "PROPOSING" | "COMMITTING" | "REVEALING" | "ACCEPTED" | "UNDETERMINED"
  | "FINALIZED" | "CANCELED" | "APPEAL_REVEALING" | "APPEAL_COMMITTING" | "VALIDATORS_TIMEOUT" | "LEADER_TIMEOUT"
  | "LEADER_REVEALING" | "UNKNOWN";

const BY_NAME: Record<string, StoredStatus> = {
  UNINITIALIZED: "UNINITIALIZED", PENDING: "PENDING", PROPOSING: "PROPOSING", COMMITTING: "COMMITTING",
  REVEALING: "REVEALING", ACCEPTED: "ACCEPTED", UNDETERMINED: "UNDETERMINED", FINALIZED: "FINALIZED",
  CANCELED: "CANCELED", CANCELLED: "CANCELED", APPEALREVEALING: "APPEAL_REVEALING",
  APPEAL_REVEALING: "APPEAL_REVEALING", APPEALCOMMITTING: "APPEAL_COMMITTING", APPEAL_COMMITTING: "APPEAL_COMMITTING",
  VALIDATORSTIMEOUT: "VALIDATORS_TIMEOUT", VALIDATORS_TIMEOUT: "VALIDATORS_TIMEOUT",
  LEADERTIMEOUT: "LEADER_TIMEOUT", LEADER_TIMEOUT: "LEADER_TIMEOUT",
  LEADERREVEALING: "LEADER_REVEALING", LEADER_REVEALING: "LEADER_REVEALING",
};

/** Both wire spellings ("Accepted" from the lifecycle read, "ACCEPTED" from the transaction) to one name. */
export function normalizeStatus(raw: unknown): StoredStatus {
  const key = String(raw ?? "").replace(/[\s-]/g, "").toUpperCase();
  return BY_NAME[key] ?? BY_NAME[key.replace(/_/g, "")] ?? "UNKNOWN";
}

export const STATUS_TEXT: Record<StoredStatus, string> = {
  UNINITIALIZED: "Not known to the network yet",
  PENDING: "Queued, waiting for the network to start it",
  PROPOSING: "A leader validator is executing it",
  COMMITTING: "Validators are committing their votes",
  REVEALING: "Validators are revealing their votes",
  LEADER_REVEALING: "The leader is revealing its execution before the votes are opened",
  ACCEPTED: "Accepted by the validators; the appeal window is open, so it is not final yet",
  UNDETERMINED: "The validators reached no decision; nothing it asked for was recorded",
  FINALIZED: "Finalized: no appeal can change it now",
  CANCELED: "Canceled before consensus completed",
  APPEAL_COMMITTING: "Under protocol appeal: a fresh committee is committing votes",
  APPEAL_REVEALING: "Under protocol appeal: a fresh committee is revealing votes",
  VALIDATORS_TIMEOUT: "Validators reported a timeout; the appeal window is open",
  LEADER_TIMEOUT: "The leader timed out; the appeal window is open",
  UNKNOWN: "Status not recognised",
};

/** The lifecycle read's next action, in words. Finalize is something the protocol does, never a status. */
export function actionText(action: string): string {
  const known: Record<string, string> = {
    "": "Not reported by the network",
    NoOp: "None",
    Finalize: "Finalize: the appeal window has passed and the network finalizes it",
    ResolveAppeal: "Resolve the appeal that was raised",
  };
  return known[action] ?? action.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/^./, (ch) => ch.toUpperCase());
}

/** A round's consensus result, in words. */
export function consensusText(result: string): string {
  const known: Record<string, string> = {
    MAJORITY_AGREE: "The majority of validators agreed with the leader",
    MAJORITY_DISAGREE: "The majority of validators disagreed with the leader",
    NO_MAJORITY: "The validators reached no majority",
    AGREE: "The validators agreed",
    DISAGREE: "The validators disagreed",
    TIMEOUT: "The round timed out",
    DETERMINISTIC_VIOLATION: "A validator reported a different deterministic result",
  };
  return known[result] ?? result.replace(/_/g, " ").toLowerCase().replace(/^./, (ch) => ch.toUpperCase());
}

/**
 * A failure before or while signing, in the app's own words. What a library
 * raised is matched and never shown as the message; the app's own sentences
 * (they say "nothing was signed") are shown as they are.
 */
export function flowError(raw: unknown): { title: string; detail: string } {
  const text = String(raw ?? "").trim();
  const known: [RegExp, string, string][] = [
    [/nothing was signed/i, "Nothing was signed", text],
    [/user rejected|user denied|rejected the request|denied transaction|\b4001\b/i, "You declined it in your wallet", "Nothing was sent."],
    [/InsufficientFees/i, "The fee deposit was too small",
      "The deposit did not cover the fees the network quoted. Nothing was charged. Price it again."],
    [/MaxPriceExceeded/i, "The network price moved",
      "The price rose past the maximum that was quoted. Nothing was charged. Price it again."],
    [/insufficient funds|insufficient balance|exceeds (the )?balance/i, "This wallet does not hold enough GEN",
      "It needs the amount shown plus the refundable fee deposit. The status page links the faucet."],
    [/execution failed/i, "The contract would refuse this",
      "The network simulated it first and the contract refused, so nothing was signed. Reload the case: its state may have changed."],
    [/429|-32029|rate limit|server busy|retry later/i, "The network is busy",
      "Studio Next limits how often one address can call it. Nothing was sent. Wait a minute and try again."],
    [/fetch failed|failed to fetch|network|timeout|timed out|econnreset|\b50[234]\b/i, "The network did not answer",
      "The request did not reach Studio Next. If your wallet had already asked you to sign, check the case before trying again."],
  ];
  for (const [pattern, title, detail] of known) if (pattern.test(text)) return { title, detail };
  return {
    title: "This did not go through",
    detail: "The wallet or the network reported a problem the app does not recognise. If your wallet had already asked "
      + "you to sign, check the case before trying again; otherwise nothing was sent.",
  };
}

/** Statuses that are a decision and open an appeal window. */
const DECIDED: StoredStatus[] = ["ACCEPTED", "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"];
const IN_FLIGHT: StoredStatus[] = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "LEADER_REVEALING",
  "APPEAL_COMMITTING", "APPEAL_REVEALING"];

export interface Lifecycle {
  storedStatus: string;
  projectedStatus: string;
  resolutionAction: string;
  resolutionSource: string;
  decisionId: string | null;
  decisionActive: boolean;
  evaluatedAt: number;
}

export interface ProtocolStatus {
  hash: string;
  stored: StoredStatus;
  projected: StoredStatus;
  /** The protocol's next action from the lifecycle read: NoOp, ResolveAppeal, Finalize... */
  action: string;
  decisionId: string | null;
  decisionActive: boolean;
  /** MAJORITY_AGREE, MAJORITY_DISAGREE, ... once a round has decided. */
  consensus: string;
  /** The leader's execution result: SUCCESS / FINISHED_WITH_RETURN, ERROR... */
  execution: string;
  /** Unix seconds the decision entered its appeal window, when the network reports it. */
  decidedAt: number | null;
  /** The network's appeal window in seconds (Studio's setting), when it reports one. */
  windowSeconds: number | null;
  appealed: boolean;
  appealFailed: number;
  rounds: string[];
  validators: number | null;
  /** True only when the lifecycle read was available; otherwise the stored status stands alone. */
  lifecycleRead: boolean;
  /** A payable write refuses by returning, so its execution succeeds: the contract's reason, or "" when it did not refuse. */
  returnedRefusal: string | null;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Build the snapshot from the raw transaction, the lifecycle read and the window setting. Pure. */
export function protocolStatus(hash: string, tx: Record<string, unknown>, lc: Lifecycle | null,
  windowSeconds: number | null): ProtocolStatus {
  const stored = normalizeStatus(lc?.storedStatus ?? tx.status ?? tx.statusName);
  const leader = leaderRow(tx);
  const returned = returnedJsonOf<{ refused?: boolean; reason?: unknown }>(tx);
  const history = (tx.consensus_history as { consensus_results?: { consensus_round?: string }[] } | undefined)
    ?.consensus_results ?? [];
  return {
    hash,
    stored,
    projected: normalizeStatus(lc?.projectedStatus ?? stored),
    action: lc?.resolutionAction ?? "",
    decisionId: lc?.decisionId ?? null,
    decisionActive: lc?.decisionActive === true,
    consensus: String(tx.result_name ?? ""),
    execution: String(leader?.execution_result ?? ""),
    decidedAt: num(tx.timestamp_awaiting_finalization),
    windowSeconds,
    appealed: tx.appealed === true,
    appealFailed: Number(tx.appeal_failed ?? 0) || 0,
    rounds: history.map((r) => String(r.consensus_round ?? "")).filter(Boolean),
    validators: num(tx.num_of_initial_validators),
    lifecycleRead: !!lc,
    returnedRefusal: returned?.refused === true ? String(returned.reason ?? "") : null,
  };
}

export const executionOk = (s: ProtocolStatus) => s.execution === "SUCCESS" || s.execution === "FINISHED_WITH_RETURN";
export const agreed = (s: ProtocolStatus) => s.consensus === "MAJORITY_AGREE" || s.consensus === "AGREE";

/**
 * What a transaction did, from the network's own record of it: recorded
 * only when the validators agreed and the contract executed it without
 * refusing (a payable write refuses by returning, so the returned value is
 * read too). In flight, or without a consensus result, it is unknown.
 */
export function outcomeOfStatus(s: ProtocolStatus, tx: Record<string, unknown>): "recorded" | "refused" | "undecided" | "unknown" {
  if (s.stored === "UNDETERMINED" || s.stored === "CANCELED" || s.stored === "LEADER_TIMEOUT" || s.stored === "VALIDATORS_TIMEOUT") {
    return "undecided";
  }
  if (s.stored !== "ACCEPTED" && s.stored !== "FINALIZED") return "unknown";
  if (!s.consensus) return "unknown";
  if (!agreed(s)) return "undecided";
  if (!executionOk(s)) return "refused";
  return s.returnedRefusal !== null || returnedJsonOf<{ refused?: boolean }>(tx)?.refused === true ? "refused" : "recorded";
}

/** Final AND the write happened: the only state the app calls finalized and recorded. */
export const finalizedAndRecorded = (s: ProtocolStatus) => s.stored === "FINALIZED" && executionOk(s) && agreed(s)
  && s.returnedRefusal === null;

/** What a FINALIZED transaction did, from the network's record alone. */
export function finalOutcome(s: ProtocolStatus): "recorded" | "no-majority" | "refused" {
  if (!agreed(s)) return "no-majority";
  return executionOk(s) && s.returnedRefusal === null ? "recorded" : "refused";
}
export const inFlight = (s: ProtocolStatus) => IN_FLIGHT.includes(s.stored);
export const decided = (s: ProtocolStatus) => DECIDED.includes(s.stored);

/** When the appeal window is expected to close, in ms, or null when the network did not report enough. */
export function appealWindowEnds(s: ProtocolStatus): number | null {
  if (!s.decidedAt || !s.windowSeconds) return null;
  return (s.decidedAt + s.windowSeconds) * 1000;
}

export type AppealKind = "VALIDATOR" | "LEADER";

/**
 * Whether a protocol appeal can be submitted now, and of which kind. The
 * lifecycle read decides: an active, non-null decision, a decided stored
 * status, and no Finalize action yet. The countdown is shown as an estimate.
 */
export function appealable(s: ProtocolStatus, nowMs: number): { ok: boolean; kind: AppealKind | null; why: string } {
  if (!s.lifecycleRead) {
    return { ok: false, kind: null, why: "The network did not serve the lifecycle read, so an appeal cannot be bound to a decision." };
  }
  if (!decided(s)) {
    return { ok: false, kind: null, why: s.stored === "FINALIZED" ? "Finalized: the appeal window has closed." : "Not decided yet." };
  }
  if (!s.decisionActive || !s.decisionId) {
    return { ok: false, kind: null, why: "The network reports no active decision to appeal." };
  }
  if (s.action === "Finalize") return { ok: false, kind: null, why: "The appeal window has closed; it can only be finalized." };
  const end = appealWindowEnds(s);
  if (end !== null && nowMs > end + 5_000) {
    return { ok: false, kind: null, why: "The appeal window has passed." };
  }
  const kind: AppealKind = s.stored === "ACCEPTED" || s.stored === "VALIDATORS_TIMEOUT" ? "VALIDATOR" : "LEADER";
  return { ok: true, kind, why: "" };
}

let windowSetting: Promise<number | null> | null = null;

/** Studio's appeal window setting in seconds (sim_getFinalityWindowTime), or null where it is not served. */
export function finalityWindow(): Promise<number | null> {
  windowSetting ??= rpc("sim_getFinalityWindowTime", []).then((v) => num(v)).catch(() => null);
  return windowSetting;
}

/** Read everything the protocol reports about one transaction. */
export async function readProtocolStatus(hash: string): Promise<ProtocolStatus> {
  const [tx, lc, windowSeconds] = await Promise.all([
    fetchTx(hash),
    rpc("gen_getTransactionLifecycle", [{ txId: hash }]).then((v) => v as Lifecycle).catch(() => null),
    finalityWindow(),
  ]);
  return protocolStatus(hash, tx, lc, windowSeconds);
}
