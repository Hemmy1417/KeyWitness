/**
 * The records the contract returns, field for field. Every name here is the
 * contract's own; the UI never renames a field it reads.
 */

export type Role = "CLAIMANT" | "RESPONDENT" | "INSPECTOR";
export type Party = "CLAIMANT" | "RESPONDENT";
export type CaseState =
  | "DRAFT" | "OPEN" | "DETERMINED" | "UNDER_CHALLENGE" | "FINAL" | "DECLINED" | "WITHDRAWN" | "EXPIRED" | "LAPSED";
/** The states nothing leaves: the contract's TERMINAL. */
export const CLOSED: readonly CaseState[] = ["FINAL", "DECLINED", "WITHDRAWN", "EXPIRED", "LAPSED"];
export type Finding = "SUPPORTED" | "NOT_ESTABLISHED" | "CONFLICTING" | "INSUFFICIENT" | "NOT_ASSESSED";
export type EvidenceKind = "PHOTO" | "VIDEO_FRAME" | "DOCUMENT_PAGE" | "TEXT_DOCUMENT";
/**
 * Where an item's exact bytes were filed before: by the same wallet in a case
 * with a different other party (SELF), by the same wallet in an earlier case
 * between the same two parties (RELATED), or by another wallet (OTHER).
 */
export type Reuse = "" | "SELF" | "RELATED" | "OTHER";
export type EventKind = "REPAIR_COMPLETED" | "CONDITION_AT_INSPECTION" | "DAMAGE_BEYOND_WEAR" | "MAINTENANCE_REPORTED";

export interface Criterion {
  id: string;
  text: string;
  needs_independent: boolean;
}

export interface Requirement {
  type: string;
  min: number;
}

export interface Terms {
  rules: string;
  case_id: string;
  version: number;
  published_at: string;
  digest: string;
  title: string;
  event_kind: EventKind;
  property_ref: string;
  time_zone: string;
  window_start: string;
  deadline: string;
  claim: string;
  criteria: Criterion[];
  allowed: EvidenceKind[];
  required: Requirement[];
  limitations: string[];
  claimant: string;
  respondent: string;
  inspector: string;
  held_sum_wei: string;
  funder: "" | Party;
  challenge_bond_wei: string;
  evidence_period_seconds: number;
  challenge_window_seconds: number;
  challenge_evidence_seconds: number;
  follows_case: string;
}

export interface Challenge {
  by: Party;
  by_address: string;
  reason: string;
  bond_wei: string;
  opened_at: string;
  decision_challenged: string;
  /** The challenger files new evidence until here. */
  evidence_ends: string;
  /** The other side and the inspector may answer it until here; then anyone may run the readjudication. */
  reply_ends: string;
  close_after: string;
  outcome: string;
  bond_to: "" | "CHALLENGER" | Party;
  /** Readjudication rounds run during this challenge that did not become a decision. */
  rounds: number;
  /** A round could not see images the challenged decision had seen: the network's fault, not the challenger's. */
  network_fault: boolean;
  closed_at?: string;
}

export interface Settlement {
  held_sum_wei: string;
  to_role: Party | "DEPOSITOR";
  to: string;
  why: string;
  at: string;
}

export interface Case {
  case_id: string;
  state: CaseState;
  claimant: string;
  respondent: string;
  inspector: string;
  inspector_accepted: boolean;
  version: number;
  accepted_version: number;
  accepted_digest: string;
  accepted_at: string;
  funded_wei: string;
  funder_address: string;
  created_at: string;
  updated_at: string;
  draft_expires_at: string;
  opened_at: string;
  evidence_deadline: string;
  ready: Record<Role, boolean>;
  decisions: string[];
  standing: string;
  challenge: Challenge | null;
  retries_used: number;
  /** The sides that have asked for an assessment again; each may once. */
  retried_by: Party[];
  settlement: Settlement | null;
  closed_reason: string;
  follows_case: string;
  /** The first case of the dispute this one continues (its own id when it follows none). */
  thread: string;
  counts: Partial<Record<Role, { img: number; doc: number; cimg: number; cdoc: number }>>;
  evidence_ids: string[];
}

export interface CaseSummary {
  case_id: string;
  state: CaseState;
  title: string;
  event_kind: EventKind;
  claimant: string;
  respondent: string;
  inspector: string;
  created_at: string;
  updated_at: string;
  overall: "" | Finding;
  held_sum_wei: string;
}

export interface CasesPage {
  total: number;
  cases: CaseSummary[];
}

export interface Evidence {
  evidence_id: string;
  case_id: string;
  kind: EvidenceKind;
  role: Role;
  filed_by: string;
  filed_at: string;
  sha256: string;
  bytes: number;
  seq: number;
  during_challenge: boolean;
  first_filed_in: string;
  /** Where the exact bytes came from; see Reuse. Only the claimant's own (SELF) is floored. */
  reuse: Reuse;
  file_name: string;
  description: string;
  declared_capture: string;
  criteria: string[];
  redacted: boolean;
  redaction_note: string;
  media_type: string;
  doc_type: string;
  frame_time: string;
  title?: string;
}

export interface CriterionFinding {
  id: string;
  text: string;
  needs_independent: boolean;
  finding: Finding;
  model_finding: string;
  floors: string[];
  basis: string[];
  contrary: string[];
  missing: string[];
  rationale: string;
}

export interface SnapshotItem {
  evidence_id: string;
  kind: EvidenceKind;
  role: Role;
  sha256: string;
  filed_at: string;
  declared_capture: string;
  new_in_challenge: boolean;
  first_filed_in: string;
  reuse: Reuse;
}

export interface Observation {
  evidence_id: string;
  seen: boolean;
  shows: string;
  /** Text the examination read off the image, line by line. */
  text: string[];
  /** The transcript was longer than the record holds, so `text` is only part of it. */
  text_cut?: boolean;
  /** Dates visible in the image, as written there. */
  dates: string[];
  subject_doubts: string;
  quality: string;
}

export interface Decision {
  decision_id: string;
  case_id: string;
  round: number;
  kind: "ASSESSMENT" | "READJUDICATION" | "CODE";
  /** What a decision is and is not, as the contract writes it into every decision. */
  scope: string;
  terms_version: number;
  terms_digest: string;
  manifest_digest: string;
  evidence: SnapshotItem[];
  decided_at: string;
  requested_by: string;
  criteria: CriterionFinding[];
  overall: Finding;
  limitations: string[];
  instructions_found: string[];
  seen_ids: string[];
  unseen_ids: string[];
  observations: Observation[];
  bound: { findings: string; leader_recorded: string[] };
  /** The leading validator's model read the contract's calibration image before examining evidence images. */
  calibrated: boolean;
  status: "STANDING" | "SUPERSEDED" | "FINAL" | "NO_RESULT";
  supersedes: string;
  superseded_by: string;
  challenge_window_ends: string;
  decision_digest: string;
}

export interface ReceiptCore {
  schema: string;
  rules: string;
  case_id: string;
  case_state: CaseState;
  terms: {
    version: number; digest: string; title: string; event_kind: EventKind; claim: string; criteria: Criterion[];
    time_zone: string; window_start: string; deadline: string; limitations: string[]; property_ref: string;
  };
  parties: { claimant: string; respondent: string; inspector: string };
  /** The whole decision, so its own digest can be recomputed from a receipt. */
  decision: Decision;
  history: { decision_id: string; round: number; kind: string; overall: Finding; status: string; decided_at: string;
    decision_digest: string }[];
  challenge: Challenge | null;
  settlement: Settlement | null;
}

export interface ChainReceipt {
  core: ReceiptCore;
  digest: string;
}

export interface CaseEvent {
  n: number;
  kind: string;
  detail: string;
  at: string;
  by: string;
}

export interface EventsPage {
  total: number;
  events: CaseEvent[];
}

export interface Credit {
  owed: string;
  paid: string;
}

export interface Stats {
  case: string;
  evidence: string;
  decision: string;
  held_wei: string;
  bonds_wei: string;
  owed_wei: string;
  paid_out_wei: string;
}

export interface Config {
  rules: string;
  receipt_schema: string;
  event_kinds: Record<EventKind, string>;
  evidence_kinds: EvidenceKind[];
  doc_types: string[];
  requirement_types: string[];
  findings: Finding[];
  limits: Record<string, unknown>;
  deployer: string;
}
