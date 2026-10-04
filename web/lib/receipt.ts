/**
 * Decision receipts: building them from the chain and verifying them later.
 *
 * The contract's get_receipt view returns a receipt CORE and the sha256 of
 * its canonical JSON. The canonical form here is byte for byte the
 * contract's: json.dumps(value, sort_keys=True, separators=(",", ":"),
 * ensure_ascii=True). So a digest computed in this browser equals the one
 * computed on chain, and any edit to a receipt changes it.
 *
 * Two modes. A PRIVATE receipt carries the whole core. A PUBLIC receipt
 * carries a redaction of it (no party addresses, no property reference, no
 * model prose that could quote a private document, no challenge reason), and
 * the verifier proves it is a faithful redaction by applying the same
 * redaction to the chain's core and comparing digests.
 *
 * What a receipt can prove: that this is what the contract recorded (when
 * checked against the chain). What it cannot prove: that any photograph is
 * authentic, that any date is genuine, or that the event happened.
 */
import { sha256Hex } from "./hash";
import type { Decision, ReceiptCore } from "./types";

export const RECEIPT_FILE_SCHEMA = "keywitness.receipt-file/1";

/** Canonical JSON identical to the contract's _canon. */
export function canonical(value: unknown): string {
  return asciiOnly(stringifySorted(value));
}

function stringifySorted(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isInteger(value)) {
      throw new Error("Receipts carry no fractional numbers.");
    }
    if (value === undefined) return "null";
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stringifySorted).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort(compareCodePoints);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stringifySorted(obj[k])}`).join(",")}}`;
}

/** Python sorts keys by code point; JavaScript's default sort compares UTF-16 units. */
function compareCodePoints(a: string, b: string): number {
  const x = [...a].map((ch) => ch.codePointAt(0) ?? 0);
  const y = [...b].map((ch) => ch.codePointAt(0) ?? 0);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return x.length - y.length;
}

/**
 * ensure_ascii=True: Python escapes every unit outside space to tilde, so DEL
 * (0x7f) and everything above it become lowercase \\uXXXX escapes. Control
 * characters below space are already escaped by JSON.stringify, in the same
 * forms Python uses.
 */
function asciiOnly(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code > 0x7e ? `\\u${code.toString(16).padStart(4, "0")}` : s[i];
  }
  return out;
}

export async function digestOf(value: unknown): Promise<string> {
  return sha256Hex(canonical(value));
}

/** The fields of a decision that change after it is recorded; its digest covers everything else. */
export const DECISION_MUTABLE = ["status", "supersedes", "superseded_by", "challenge_window_ends", "decision_digest"] as const;

/** A decision without its lifecycle fields: the part that never changes. */
export function stableDecision(d: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(d).filter(([k]) => !(DECISION_MUTABLE as readonly string[]).includes(k)));
}

/** The digest the contract computed over a decision when it recorded it. */
export async function decisionDigestOf(d: Record<string, unknown>): Promise<string> {
  return digestOf(stableDecision(d));
}

/**
 * The public redaction of one decision: findings, floors, cited ids and
 * digests stay; the validators' prose, the requester's address, the notes on
 * each image and declared capture times go. Deterministic: the verifier runs
 * the same function on the chain's decision.
 */
export function publicDecision(d: Decision): Record<string, unknown> {
  return {
    decision_id: d.decision_id, case_id: d.case_id, round: d.round, kind: d.kind, scope: d.scope,
    terms_version: d.terms_version, terms_digest: d.terms_digest, manifest_digest: d.manifest_digest,
    evidence: d.evidence.map((e) => ({
      evidence_id: e.evidence_id, kind: e.kind, role: e.role, sha256: e.sha256, filed_at: e.filed_at,
      new_in_challenge: e.new_in_challenge, first_filed_in: e.first_filed_in, reuse: e.reuse,
    })),
    decided_at: d.decided_at,
    criteria: d.criteria.map((c) => ({
      id: c.id, text: c.text, needs_independent: c.needs_independent, finding: c.finding,
      model_finding: c.model_finding, floors: c.floors, basis: c.basis, contrary: c.contrary,
    })),
    overall: d.overall, instructions_found: d.instructions_found, seen_ids: d.seen_ids, unseen_ids: d.unseen_ids,
    calibrated: d.calibrated, bound: d.bound, status: d.status, supersedes: d.supersedes,
    superseded_by: d.superseded_by, challenge_window_ends: d.challenge_window_ends, decision_digest: d.decision_digest,
  };
}

/** The public redaction of a core. Deterministic: the verifier runs the same function on the chain's core. */
export function publicCore(core: ReceiptCore): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(core)) as Record<string, unknown> & ReceiptCore;
  const terms = { ...copy.terms } as Record<string, unknown>;
  delete terms.property_ref;
  const decision = publicDecision(core.decision);
  const challenge = core.challenge ? {
    by: core.challenge.by, opened_at: core.challenge.opened_at, decision_challenged: core.challenge.decision_challenged,
    outcome: core.challenge.outcome, bond_to: core.challenge.bond_to,
  } : null;
  const settlement = core.settlement ? {
    held_sum_wei: core.settlement.held_sum_wei, to_role: core.settlement.to_role, at: core.settlement.at,
  } : null;
  return {
    schema: core.schema, rules: core.rules, case_id: core.case_id, case_state: core.case_state,
    terms, parties: { roles: ["claimant", "respondent", ...(core.parties.inspector ? ["inspector"] : [])] },
    decision, history: core.history, challenge, settlement,
  };
}

export interface ReceiptFile {
  schema: typeof RECEIPT_FILE_SCHEMA;
  mode: "private" | "public";
  network: { name: string; chain_id: number; contract: string; explorer: string };
  case_id: string;
  /** The chain's digest of the full core at the time this file was made. */
  chain_digest: string;
  /** The full core (private) or its public redaction. */
  core: Record<string, unknown>;
  /** sha256 of `core` above, so any edit to this file is detectable on its own. */
  core_digest: string;
  /**
   * Transactions found for the case, each verifiable on the explorer, with
   * what each did: recorded, refused by the contract, undecided by the
   * validators, or unknown when the explorer did not say.
   */
  transactions: { method: string; outcome?: string; hash: string; url: string }[];
  /**
   * How far the explorer was searched for them: "all" covered the case's
   * whole life, "newest" stopped early so older ones may be missing, "none"
   * means no search answered. The record never depends on this list.
   */
  transactions_searched: TransactionsSearched;
  /** When this file was generated, which is not when anything happened. */
  generated_at: string;
  notice: string;
}

export type TransactionsSearched = "all" | "newest" | "none";

export const RECEIPT_NOTICE =
  "This receipt shows what the KeyWitness contract recorded. A digest proves the record was not edited; it does not " +
  "prove that a photograph is authentic, that a date is genuine, or that the event happened. A finding is an " +
  "assessment of evidence against agreed criteria, not a legal determination.";

export async function buildReceiptFile(args: {
  core: ReceiptCore; chainDigest: string; mode: "private" | "public";
  network: ReceiptFile["network"]; transactions: ReceiptFile["transactions"]; now: Date;
  searched?: TransactionsSearched;
}): Promise<ReceiptFile> {
  const core = args.mode === "private" ? (args.core as unknown as Record<string, unknown>) : publicCore(args.core);
  return {
    schema: RECEIPT_FILE_SCHEMA, mode: args.mode, network: args.network, case_id: args.core.case_id,
    chain_digest: args.chainDigest, core, core_digest: await digestOf(core), transactions: args.transactions,
    transactions_searched: args.searched ?? "none",
    generated_at: args.now.toISOString(), notice: RECEIPT_NOTICE,
  };
}

export type CheckResult = "pass" | "fail" | "skipped";

export interface Verification {
  shape: CheckResult;
  /** The file's core matches its own digest: nothing in the file was edited. */
  integrity: CheckResult;
  /** This browser recomputed the chain's digest from the chain's own record and got the same value. */
  reproduced: CheckResult;
  /** The chain holds this exact record now (full or faithfully redacted). */
  chain: CheckResult;
  /**
   * The decision in the file is a decision the contract holds, unchanged. It
   * is checked on its own because a receipt's record changes as its case
   * moves on (a challenge, the settlement) while its decision never does.
   */
  decision: CheckResult;
  /** The record changed on chain since the file was made (for example the case settled). */
  changedSince: boolean;
  /** The decision is on chain unchanged and the case around it has moved on: a true receipt, out of date. */
  movedOn: boolean;
  notes: string[];
}

const MOVED: Record<string, string> = {
  DETERMINED: "decided and open to challenge", UNDER_CHALLENGE: "under challenge", FINAL: "final",
};

export function parseReceiptFile(text: string): ReceiptFile | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return "This is not JSON.";
  }
  const f = raw as Partial<ReceiptFile>;
  if (f?.schema !== RECEIPT_FILE_SCHEMA) return "This is not a KeyWitness receipt file.";
  if (f.mode !== "private" && f.mode !== "public") return "The receipt's mode is neither private nor public.";
  if (typeof f.case_id !== "string" || !/^KW-\d{4,}$/.test(f.case_id)) return "The receipt names no case.";
  if (!f.core || typeof f.core !== "object") return "The receipt carries no record.";
  if (typeof f.core_digest !== "string" || !/^[0-9a-f]{64}$/.test(f.core_digest)) return "The receipt's digest is missing.";
  if (typeof f.chain_digest !== "string" || !/^[0-9a-f]{64}$/.test(f.chain_digest)) return "The chain digest is missing.";
  if (!f.network || typeof f.network.contract !== "string") return "The receipt names no contract.";
  return f as ReceiptFile;
}

/**
 * Whether the decision a file carries is a decision the contract holds.
 * A private file carries the whole decision, so its digest is recomputed
 * here and compared with the chain's; a public file is compared with the
 * same redaction of the chain's decision.
 */
export async function verifyDecision(file: ReceiptFile, chainDecision: Decision | null): Promise<CheckResult> {
  const mine = (file.core as { decision?: Record<string, unknown> }).decision;
  if (!chainDecision || !mine || typeof mine !== "object") return "skipped";
  // The chain's own record must reproduce its digest here, or nothing below compares like with like.
  if ((await decisionDigestOf(chainDecision as unknown as Record<string, unknown>)) !== chainDecision.decision_digest) return "fail";
  if (file.mode === "private") {
    return (await decisionDigestOf(mine)) === chainDecision.decision_digest ? "pass" : "fail";
  }
  return canonical(stableDecision(mine)) === canonical(stableDecision(publicDecision(chainDecision))) ? "pass" : "fail";
}

/**
 * Verify a receipt file, optionally against the chain's current receipt and
 * against the chain's copy of the decision the file names.
 */
export async function verifyReceipt(file: ReceiptFile, chain: { core: ReceiptCore; digest: string } | null,
  chainDecision: Decision | null = null): Promise<Verification> {
  const notes: string[] = [];
  let integrity: CheckResult = (await digestOf(file.core)) === file.core_digest ? "pass" : "fail";
  if (integrity === "fail") notes.push("The record inside the file does not match its own digest: the file was edited.");
  // A private file carries the chain's core itself, so its digest must be the chain digest it names.
  if (integrity === "pass" && file.mode === "private" && file.core_digest !== file.chain_digest) {
    integrity = "fail";
    notes.push("The record inside the file is not the record whose chain digest the file names.");
  }
  if (!chain) {
    notes.push("Not checked against the chain: this is only an integrity check of the file itself.");
    return { shape: "pass", integrity, reproduced: "skipped", chain: "skipped", decision: "skipped", changedSince: false,
      movedOn: false, notes };
  }
  // The contract's digest must be reproducible here, or nothing below compares like with like.
  const reproduced: CheckResult = (await digestOf(chain.core)) === chain.digest ? "pass" : "fail";
  if (reproduced === "fail") {
    notes.push("This browser could not reproduce the digest the contract reports for its own record, so the chain comparison cannot be trusted.");
    return { shape: "pass", integrity, reproduced, chain: "fail", decision: "skipped", changedSince: false, movedOn: false,
      notes };
  }
  if (integrity === "fail") {
    // The digest a file carries says nothing once its content has been changed: an edited file is a copy of no
    // record, so nothing about it is compared with the chain and no check may pass for it.
    notes.push("Nothing an edited file says can be relied on. Ask for the receipt again, or make one from the case's receipt page.");
    return { shape: "pass", integrity, reproduced, chain: "fail", decision: "skipped", changedSince: false, movedOn: false,
      notes };
  }
  const decision = await verifyDecision(file, chainDecision);
  const onChain = file.mode === "private" ? (chain.core as unknown as Record<string, unknown>) : publicCore(chain.core);
  const chainDigestNow = await digestOf(onChain);
  const changedSince = chain.digest !== file.chain_digest;
  let result: CheckResult;
  let movedOn = false;
  if (chainDigestNow === file.core_digest) {
    result = "pass";
  } else if (decision === "pass") {
    // The decision in the file is on chain, byte for byte. What differs is the case around it: a challenge, a
    // later decision, the settlement. A true receipt that is out of date, which a made-up file can never be.
    result = "fail";
    movedOn = true;
    const was = String((file.core as { case_state?: string }).case_state ?? "");
    const mineId = String((file.core as { decision?: { decision_id?: string } }).decision?.decision_id ?? "");
    const standing = chain.core.decision.decision_id;
    notes.push("The decision in this receipt is on the chain, unchanged. The case has moved on since the receipt was made"
      + (was && was !== chain.core.case_state ? `: it was ${MOVED[was] ?? was.toLowerCase()} then and is ${MOVED[chain.core.case_state] ?? chain.core.case_state.toLowerCase()} now` : "")
      + (mineId && mineId !== standing ? "; a later decision now stands" : "")
      + ". Make a new receipt to see the current record.");
  } else if (decision === "fail") {
    result = "fail";
    notes.push("The decision in this file is not a decision the contract holds. The file does not come from this contract's record.");
  } else if (changedSince) {
    // No copy of the decision was read from the chain, so this cannot be told apart from a made-up file.
    result = "fail";
    notes.push("The chain's record differs from this file, and the decision it names could not be read from the chain to tell whether the case has only moved on.");
  } else {
    result = "fail";
    notes.push("The chain holds a different record for this case.");
  }
  if (result === "pass") notes.push(file.mode === "public"
    ? "The public record is a faithful redaction of what the contract holds now."
    : "The record is exactly what the contract holds now.");
  return { shape: "pass", integrity, reproduced, chain: result, decision, changedSince, movedOn, notes };
}
