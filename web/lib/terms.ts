/**
 * The create-case wizard's model: a draft a person edits, the checks each
 * step runs (the contract's own limits, checked here first so a mistake is
 * caught before anything is signed), and the exact JSON open_case reads.
 * The contract checks everything again; this never replaces that.
 */
import { caseIdFrom, parseGen } from "./present";
import type { EventKind, EvidenceKind, Party, Terms } from "./types";

export const LIMITS = {
  title: 120, claim: 400, criterion: 300, line: 300, property: 80, criteria: 6, limitations: 4, required: 4,
  minHeldWei: 10n ** 16n, maxHeldWei: 1000n * 10n ** 18n, minBondWei: 10n ** 16n, maxBondWei: 100n * 10n ** 18n,
  minWindow: 600, minChallengeWindow: 3600, maxEvidence: 30 * 86400, maxChallenge: 14 * 86400,
  // What one party may file alone: required evidence can never ask for more.
  partyImages: 5, partyDocuments: 4,
};

export const WINDOW_PRESETS: { seconds: number; label: string }[] = [
  { seconds: 600, label: "10 minutes (demonstration)" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 86400, label: "1 day" },
  { seconds: 3 * 86400, label: "3 days" },
  { seconds: 7 * 86400, label: "7 days" },
  { seconds: 14 * 86400, label: "14 days" },
];

export const ZONES = ["UTC", "Europe/London", "Europe/Dublin", "Europe/Berlin", "Europe/Madrid", "Africa/Lagos",
  "Africa/Nairobi", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "America/New_York",
  "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo"];

export interface DraftCriterion {
  text: string;
  needsIndependent: boolean;
}

export interface Draft {
  title: string;
  eventKind: EventKind;
  propertyRef: string;
  timeZone: string;
  windowStart: string;
  deadline: string;
  claim: string;
  criteria: DraftCriterion[];
  allowed: EvidenceKind[];
  required: { type: string; min: number }[];
  limitations: string[];
  respondent: string;
  inspector: string;
  heldSum: string;
  funder: Party;
  challengeBond: string;
  evidenceSeconds: number;
  challengeSeconds: number;
  challengeEvidenceSeconds: number;
  followsCase: string;
  acknowledged: boolean;
}

/** Starting criteria for each kind of event: a suggestion the claimant edits, never a default the contract assumes. */
export const STARTERS: Record<EventKind, DraftCriterion[]> = {
  REPAIR_COMPLETED: [
    { text: "Evidence shows the contractor attended the property to carry out the listed work.", needsIndependent: false },
    { text: "Evidence shows each listed repair task was performed.", needsIndependent: false },
    { text: "Evidence shows all of the required work was completed, with nothing left unfinished.", needsIndependent: false },
    { text: "Evidence shows the condition the repair addressed has improved.", needsIndependent: false },
    { text: "Evidence shows the work was completed before the deadline.", needsIndependent: false },
  ],
  CONDITION_AT_INSPECTION: [
    { text: "Evidence shows the condition of the named rooms or fixtures at the inspection.", needsIndependent: false },
    { text: "Evidence shows whether the stated defect was visible at the inspection.", needsIndependent: false },
  ],
  DAMAGE_BEYOND_WEAR: [
    { text: "Evidence shows the condition of the named items at the start of the occupancy.", needsIndependent: false },
    { text: "Evidence shows the condition of the same items at the end of the occupancy.", needsIndependent: false },
    { text: "The difference shown goes beyond ordinary wear and tear.", needsIndependent: false },
  ],
  MAINTENANCE_REPORTED: [
    { text: "Evidence shows the issue was reported to the responsible party.", needsIndependent: false },
    { text: "The report describes the issue the claim names.", needsIndependent: false },
    { text: "Evidence shows the report was made before the deadline.", needsIndependent: false },
  ],
};

export function emptyDraft(): Draft {
  return {
    title: "", eventKind: "REPAIR_COMPLETED", propertyRef: "", timeZone: "UTC", windowStart: "", deadline: "",
    claim: "", criteria: STARTERS.REPAIR_COMPLETED.map((c) => ({ ...c })),
    allowed: ["PHOTO", "VIDEO_FRAME", "DOCUMENT_PAGE", "TEXT_DOCUMENT"],
    required: [{ type: "PHOTO", min: 1 }], limitations: [], respondent: "", inspector: "",
    heldSum: "0", funder: "RESPONDENT", challengeBond: "0.1",
    evidenceSeconds: 86400, challengeSeconds: 86400, challengeEvidenceSeconds: 86400,
    followsCase: "", acknowledged: false,
  };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

/** A real calendar date, optionally with a real time to the minute. */
export function realLocal(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return false;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? "00", m[5] ?? "00"].map(Number) as [number, number, number, number, number];
  const at = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return y >= 1 && at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d
    && at.getUTCHours() === h && at.getUTCMinutes() === mi;
}

export function validZone(zone: string): boolean {
  if (zone === "UTC") return true;
  if (!/^[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const STEPS = ["Case", "Claim and time", "Criteria and evidence", "Parties and privacy", "Review"] as const;

/** Problems with one step, as sentences. Empty when the step is complete. */
export function check(step: number, d: Draft, me = ""): string[] {
  const out: string[] = [];
  const len = (s: string) => s.trim().length;
  if (step === 0) {
    if (len(d.title) < 5) out.push("Give the case a title of at least 5 characters.");
    if (len(d.title) > LIMITS.title) out.push(`Keep the title under ${LIMITS.title} characters.`);
    if (len(d.propertyRef) < 2) out.push("Give the property a short reference, such as a nickname.");
    if (len(d.propertyRef) > LIMITS.property) out.push(`Keep the property reference under ${LIMITS.property} characters.`);
    if (/@|https?:|www\./i.test(d.propertyRef)) out.push("Use a nickname for the property, not contact details or a link.");
    if (d.followsCase.trim() && !caseIdFrom(d.followsCase)) out.push("A follow-up names the earlier case by its number, such as 1.");
  }
  if (step === 1) {
    if (len(d.claim) < 10) out.push("State the claim in at least 10 characters.");
    if (len(d.claim) > LIMITS.claim) out.push(`Keep the claim under ${LIMITS.claim} characters.`);
    if (!validZone(d.timeZone)) out.push("Choose a time zone such as Europe/London.");
    for (const [v, what] of [[d.windowStart, "The window start"], [d.deadline, "The deadline"]] as const) {
      if (v && !LOCAL.test(v)) out.push(`${what} must be a date, optionally with a time.`);
      else if (v && !realLocal(v)) out.push(`${what} is not a real date and time.`);
    }
    // A deadline given as a day falls as that day ends, so a window may open during it.
    const falls = d.deadline.includes("T") ? d.deadline : `${d.deadline}T23:59`;
    if (d.windowStart && d.deadline && d.windowStart > falls) out.push("The window start is after the deadline.");
  }
  if (step === 2) {
    const texts = d.criteria.map((c) => c.text.trim());
    if (texts.length < 1 || texts.length > LIMITS.criteria) out.push(`Give between 1 and ${LIMITS.criteria} criteria.`);
    texts.forEach((t, i) => {
      if (t.length < 5) out.push(`Criterion ${i + 1} needs at least 5 characters.`);
      if (t.length > LIMITS.criterion) out.push(`Criterion ${i + 1} is longer than ${LIMITS.criterion} characters.`);
    });
    if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) out.push("Two criteria say the same thing.");
    if (!d.allowed.length) out.push("Allow at least one kind of evidence.");
    for (const r of d.required) {
      const doc = r.type.startsWith("DOC:");
      if (doc && !d.allowed.includes("DOCUMENT_PAGE") && !d.allowed.includes("TEXT_DOCUMENT")) {
        out.push("A required document needs a document kind to be allowed.");
      }
      if (!doc && !d.allowed.includes(r.type as EvidenceKind)) out.push("Required evidence must be of an allowed kind.");
      if (r.min < 1 || r.min > 3) out.push("A required minimum is between 1 and 3.");
    }
    if (new Set(d.required.map((r) => r.type)).size !== d.required.length) out.push("Each required type appears once.");
    if (d.required.length > LIMITS.required) out.push(`Name at most ${LIMITS.required} required entries.`);
    // A required document is filed as a page (an image) when no text documents are allowed.
    const images = ["PHOTO", "VIDEO_FRAME", "DOCUMENT_PAGE"];
    const asPages = !d.allowed.includes("TEXT_DOCUMENT");
    const isImage = (type: string) => images.includes(type) || (asPages && type.startsWith("DOC:"));
    const needImages = d.required.filter((r) => isImage(r.type)).reduce((n, r) => n + r.min, 0);
    const needDocuments = d.required.filter((r) => !isImage(r.type)).reduce((n, r) => n + r.min, 0);
    if (needImages > LIMITS.partyImages || needDocuments > LIMITS.partyDocuments) {
      out.push(`Required evidence must be something one party can file alone: at most ${LIMITS.partyImages} images and ${LIMITS.partyDocuments} documents.`);
    }
    if (d.limitations.filter((l) => l.trim()).length > LIMITS.limitations) out.push(`List at most ${LIMITS.limitations} limitations.`);
    d.limitations.forEach((l, i) => {
      if (l.trim().length > LIMITS.line) out.push(`Limitation ${i + 1} is longer than ${LIMITS.line} characters.`);
    });
  }
  if (step === 3) {
    if (!ADDRESS.test(d.respondent.trim())) out.push("The respondent must be a wallet address.");
    if (me && d.respondent.trim().toLowerCase() === me.toLowerCase()) out.push("The respondent must be a different wallet from yours.");
    if (d.inspector.trim()) {
      if (!ADDRESS.test(d.inspector.trim())) out.push("The inspector must be a wallet address.");
      const low = d.inspector.trim().toLowerCase();
      if (low === d.respondent.trim().toLowerCase() || (me && low === me.toLowerCase())) {
        out.push("The inspector must be independent of both parties.");
      }
    }
    if (d.criteria.some((c) => c.needsIndependent) && !d.inspector.trim()) {
      out.push("A criterion needs independent evidence, so name an inspector.");
    }
    const held = parseGen(d.heldSum || "0");
    if (held === null) out.push("The held sum must be a number of GEN.");
    else if (held !== 0n && (held < LIMITS.minHeldWei || held > LIMITS.maxHeldWei)) {
      out.push("The held sum must be 0, or between 0.01 and 1000 GEN.");
    }
    const bond = parseGen(d.challengeBond || "");
    if (bond === null || bond < LIMITS.minBondWei || bond > LIMITS.maxBondWei) {
      out.push("The challenge bond must be between 0.01 and 100 GEN.");
    }
    for (const [s, max] of [[d.evidenceSeconds, LIMITS.maxEvidence], [d.challengeEvidenceSeconds, LIMITS.maxChallenge]] as const) {
      if (s < LIMITS.minWindow || s > max) out.push("Each window must be between 10 minutes and its maximum.");
    }
    // A decision is dated by the request for it, and an assessment can take many minutes to be agreed.
    if (d.challengeSeconds < LIMITS.minChallengeWindow || d.challengeSeconds > LIMITS.maxChallenge) {
      out.push("The challenge window must be between 1 hour and 14 days.");
    }
  }
  if (step === 4 && !d.acknowledged) {
    out.push("Confirm that you understand the case and its evidence will be public and permanent on Studio Next.");
  }
  return out;
}

export function checkAll(d: Draft, me = ""): string[] {
  return STEPS.flatMap((_, i) => check(i, d, me));
}

/** The JSON open_case reads, built only from a draft that passes every check. */
export function buildTerms(d: Draft): Record<string, unknown> {
  const held = parseGen(d.heldSum || "0") ?? 0n;
  return {
    title: d.title.trim(), event_kind: d.eventKind, property_ref: d.propertyRef.trim(), time_zone: d.timeZone,
    window_start: d.windowStart, deadline: d.deadline, claim: d.claim.trim(),
    criteria: d.criteria.map((c) => ({ text: c.text.trim(), needs_independent: c.needsIndependent })),
    allowed: d.allowed, required: d.required, limitations: d.limitations.map((l) => l.trim()).filter(Boolean),
    respondent: d.respondent.trim(), inspector: d.inspector.trim(),
    held_sum_wei: held.toString(), funder: held ? d.funder : "",
    challenge_bond_wei: (parseGen(d.challengeBond) ?? 0n).toString(),
    evidence_period_seconds: d.evidenceSeconds, challenge_window_seconds: d.challengeSeconds,
    challenge_evidence_seconds: d.challengeEvidenceSeconds, follows_case: caseIdFrom(d.followsCase),
  };
}

/* ---- the local draft: a convenience of this browser, never the record ---- */

const DRAFT_KEY = "keywitness.draft";

export function saveDraft(d: Draft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {
    /* no storage: the draft lives only in this page */
  }
}

export function loadDraft(): (Draft & { savedAt: number }) | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Draft & { savedAt: number };
    return { ...emptyDraft(), ...v };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** An atto amount as an exact decimal GEN string for a form field ("2", "0.15"). */
export function exactGen(atto: string): string {
  let v: bigint;
  try {
    v = BigInt(atto || "0");
  } catch {
    return "0";
  }
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** A published terms version as a draft to revise. Parties and the cited case cannot change in a revision. */
export function draftFromTerms(t: Terms): Draft {
  return {
    title: t.title, eventKind: t.event_kind, propertyRef: t.property_ref, timeZone: t.time_zone,
    windowStart: t.window_start, deadline: t.deadline, claim: t.claim,
    criteria: t.criteria.map((c) => ({ text: c.text, needsIndependent: c.needs_independent })),
    allowed: [...t.allowed], required: t.required.map((r) => ({ ...r })), limitations: [...t.limitations],
    respondent: t.respondent, inspector: t.inspector, heldSum: exactGen(t.held_sum_wei),
    funder: t.funder || "RESPONDENT", challengeBond: exactGen(t.challenge_bond_wei),
    evidenceSeconds: t.evidence_period_seconds, challengeSeconds: t.challenge_window_seconds,
    challengeEvidenceSeconds: t.challenge_evidence_seconds,
    followsCase: t.follows_case ? String(Number(t.follows_case.replace(/^\D+/, ""))) : "", acknowledged: false,
  };
}
