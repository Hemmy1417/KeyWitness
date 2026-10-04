/**
 * Every word a page shows for a contract value comes from here, so a state,
 * a finding or a role reads the same everywhere and no raw code reaches a
 * person. Machine values (addresses, digests, exact ids) appear only in the
 * verification folds and on the receipt; everywhere else a record is named
 * the way a person would say it ("Case 3", "Exhibit 7").
 */
import type { CaseEvent, CaseState, EventKind, EvidenceKind, Finding, Reuse, Role } from "./types";

export const STATE_LABEL: Record<CaseState, string> = {
  DRAFT: "Draft terms",
  OPEN: "Open for evidence",
  DETERMINED: "Decision standing",
  UNDER_CHALLENGE: "Under challenge",
  FINAL: "Final",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
  LAPSED: "Lapsed",
};

export const STATE_HINT: Record<CaseState, string> = {
  DRAFT: "The claimant has written the terms. The respondent accepts the exact version, a named inspector accepts the role, and any held sum is deposited before evidence opens.",
  OPEN: "Both sides, and the inspector if there is one, file evidence until the evidence period ends or everyone marks their evidence complete.",
  DETERMINED: "Validators have assessed the evidence. The side the decision went against can challenge it until the window closes; after that anyone can finalize.",
  UNDER_CHALLENGE: "The challenger may add new evidence, then the other side may answer it. The case is judged again only if the challenger brings something new.",
  FINAL: "Settled. Nothing can change this decision now.",
  DECLINED: "The respondent declined the terms.",
  WITHDRAWN: "The claimant withdrew the case before evidence opened.",
  EXPIRED: "The draft was not opened within seven days.",
  LAPSED: "Neither party asked for the assessment in time. Nothing was decided, and any held sum went back to its depositor.",
};

export interface FindingLook {
  label: string;
  tone: "supported" | "adverse" | "uncertain" | "neutral";
  icon: string;
  meaning: string;
}

export const FINDING: Record<Finding, FindingLook> = {
  SUPPORTED: { label: "Supported", tone: "supported", icon: "check",
    meaning: "The evidence affirmatively shows the criterion is met." },
  NOT_ESTABLISHED: { label: "Not established", tone: "adverse", icon: "cross",
    meaning: "The evidence was adequate to judge the criterion and shows it is not met." },
  CONFLICTING: { label: "Conflicting", tone: "uncertain", icon: "split",
    meaning: "Material evidence points both ways and neither side outweighs the other." },
  INSUFFICIENT: { label: "Insufficient", tone: "uncertain", icon: "gap",
    meaning: "The evidence is missing, unclear or too thin to conclude either way." },
  NOT_ASSESSED: { label: "Not assessed", tone: "neutral", icon: "dash",
    meaning: "The criterion could not be assessed for a technical reason, such as no image reaching the validators." },
};

/** What the overall finding says about the claim as a whole. */
export const OVERALL_MEANING: Record<Finding, string> = {
  SUPPORTED: "Every criterion is supported, so the claim is supported.",
  NOT_ESTABLISHED: "At least one criterion is not established, so the claim is not established.",
  CONFLICTING: "No criterion is found not established, but the evidence on at least one conflicts.",
  INSUFFICIENT: "The evidence is too thin to conclude on at least one criterion, and none conflicts or fails outright.",
  NOT_ASSESSED: "The validators could not examine the evidence, so no criterion could be judged.",
};

/** How a criterion's two lists read, given its finding: what it rests on, and what points the other way. */
export function listLabels(finding: Finding): [string, string] {
  return finding === "NOT_ESTABLISHED" ? ["Shows it is not met", "Offered in support of it"]
    : ["Supports it", "Weighs against it"];
}

export const ROLE_LABEL: Record<Role, string> = { CLAIMANT: "Claimant", RESPONDENT: "Respondent", INSPECTOR: "Inspector" };

export const EVENT_LABEL: Record<EventKind, string> = {
  REPAIR_COMPLETED: "Repair or maintenance completed",
  CONDITION_AT_INSPECTION: "Condition at an inspection",
  DAMAGE_BEYOND_WEAR: "Damage beyond ordinary wear",
  MAINTENANCE_REPORTED: "Maintenance issue reported in time",
};

export const EVENT_DETAIL: Record<EventKind, string> = {
  REPAIR_COMPLETED: "Whether repair or maintenance work was finished, and finished in time.",
  CONDITION_AT_INSPECTION: "The condition of a property, or part of it, at an inspection.",
  DAMAGE_BEYOND_WEAR: "Whether the condition at the end of an occupancy goes beyond ordinary wear and tear.",
  MAINTENANCE_REPORTED: "Whether a maintenance issue was reported to the responsible party in time.",
};

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  PHOTO: "Photograph",
  VIDEO_FRAME: "Still from a video",
  DOCUMENT_PAGE: "Photographed document page",
  TEXT_DOCUMENT: "Text document",
};

export const DOC_LABEL: Record<string, string> = {
  INSPECTION_REPORT: "Inspection report",
  INVOICE: "Invoice",
  CONTRACTOR_STATEMENT: "Contractor statement",
  MAINTENANCE_MESSAGE: "Maintenance message",
  WORK_ORDER: "Work order",
  MOVE_IN_REPORT: "Move-in report",
  MOVE_OUT_REPORT: "Move-out report",
  OTHER_RECORD: "Other record",
};

/** Why a finding differs from what the panel first said, in words. */
export const FLOOR_TEXT: Record<string, string> = {
  F0: "The answer was not one of the five findings, so it counts as insufficient.",
  F1: "A conclusive finding must rest on at least one item the validators saw; none was cited.",
  F2: "The parties agreed this criterion needs the inspector's evidence; none was in the basis.",
  F3: "Only the favoured side's own evidence supported it, against material evidence from the other side or the inspector.",
  F4: "The panel itself judged the evidence inadequate to conclude.",
  F5: "Items no validator could see were set aside.",
  "F6/F7": "An item that tried to instruct the assessor cannot count for the side that filed it, as support or as opposition. The same goes for a file the claimant brought from a case with a different other party.",
  F8: "A conflict must name an item on each side; one side was missing.",
  NONE_SEEN: "No evidence reached this validator at all.",
  REQUIRED_MISSING: "Required evidence was not filed, so nothing could be established.",
  NOTHING_FILED: "No evidence was filed, so nothing could be established.",
};

/**
 * A floor in words. The record keeps F6 (an instruction) and F7 (the claimant's own reuse) under one label, so the
 * sentence is chosen from what the decision itself holds: its flags, and whether the claimant reused a file.
 */
export function floorText(floor: string, flagged = true, reused = true): string {
  if (floor !== "F6/F7") return FLOOR_TEXT[floor] ?? floor;
  const f6 = "An item that tried to instruct the assessor cannot count for the side that filed it, as support or as opposition.";
  const f7 = "A file the claimant brought from a case with a different other party cannot count for the claim.";
  return flagged && !reused ? f6 : reused && !flagged ? f7 : FLOOR_TEXT[floor]!;
}

/** Where an exhibit's exact bytes were filed before, in words. */
export function reuseText(reuse: Reuse, firstIn: string, role: Role): string {
  if (reuse === "SELF") {
    const first = `The same wallet filed these exact bytes first, in ${caseName(firstIn)}, a case with a different other party.`;
    return role === "CLAIMANT" ? `${first} A file the claimant brings from such a case cannot count for the claim here.`
      : `${first} The validators were told.`;
  }
  if (reuse === "RELATED") return `Refiled from ${caseName(firstIn)}, an earlier case between the same two parties.`;
  if (reuse === "OTHER") {
    return `A different wallet filed these exact bytes first, in ${caseName(firstIn)}. That can be a document both sides hold; the validators were told, and it counts like any other item.`;
  }
  return "";
}

export function requirementLabel(type: string, min: number): string {
  const name = type.startsWith("DOC:") ? (DOC_LABEL[type.slice(4)] ?? humanize(type.slice(4))).toLowerCase()
    : (EVIDENCE_LABEL[type as EvidenceKind] ?? humanize(type)).toLowerCase();
  return `${min === 1 ? "At least one" : `At least ${min}`} ${name}${min > 1 && !name.endsWith("s") ? "s" : ""}`;
}

/** A last resort for a code no map knows: words, sentence case. */
export function humanize(code: string): string {
  const t = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/* ---- names people can say ---- */

const tail = (id: string): string => {
  const n = Number(String(id).replace(/^\D+/, ""));
  return Number.isFinite(n) && n > 0 ? String(n) : String(id);
};

export const caseName = (cid: string) => `Case ${tail(cid)}`;
export const exhibitName = (eid: string) => `Exhibit ${tail(eid)}`;
export const decisionName = (did: string) => `Decision ${tail(did)}`;
export const criterionName = (id: string) => `Criterion ${String(id).replace(/^C/i, "")}`;

/** A case number someone typed ("3", "case 3", "KW-0003") as the contract's id, or "". */
export function caseIdFrom(text: string): string {
  const n = /^(?:kw-|case\s*)?0*(\d{1,6})$/i.exec(text.trim())?.[1];
  return n ? `KW-${n.padStart(4, "0")}` : "";
}

/**
 * Text a model or the contract wrote, with its machine ids and labels put
 * into words. A model sometimes repeats one of the 16-character tags the
 * contract fences quoted text with; a tag names nothing a reader can use, so
 * it is left out.
 */
export function prose(text: string): string {
  return String(text ?? "")
    .replace(/\s*\(\s*[0-9a-f]{16}\s*\)/g, "")
    .replace(/\s*\b[0-9a-f]{16}\b/g, "")
    .replace(/\bE-0*(\d+)\b/g, "Exhibit $1")
    .replace(/\bD-0*(\d+)\b/g, "Decision $1")
    .replace(/\bKW-0*(\d+)\b/g, "Case $1")
    .replace(/\bC([1-6])\b/g, "Criterion $1")
    .replace(/\b(SUPPORTED|NOT_ESTABLISHED|CONFLICTING|INSUFFICIENT|NOT_ASSESSED)\b/g,
      (m) => FINDING[m as Finding].label.toLowerCase());
}

/**
 * The record holds a bounded length of a model's prose. Text that stops
 * without ending a sentence was cut there, and the page says so.
 */
export function cutShort(text: string): boolean {
  const t = String(text ?? "").trim();
  return t.length > 80 && !/[.!?)"'\]]$/.test(t);
}

export const CUT_NOTE = "The record holds a limited length of reasoning; this was cut here.";

/** The record keeps 160 characters of each "what would settle it" entry; one that fills them was cut. */
export const MISSING_MAX = 160;
export function settleText(entry: string): string {
  const text = prose(entry);
  return String(entry ?? "").length >= MISSING_MAX ? `${text.replace(/[\s,;:]+$/, "")} (cut here: the record holds ${MISSING_MAX} characters)` : text;
}

/* ---- money ---- */

export const WEI = 10n ** 18n;

/** A GEN amount from atto, exact, without trailing zeros. */
export function gen(atto: string | bigint | number | null | undefined): string {
  let v: bigint;
  try {
    v = BigInt(atto ?? 0);
  } catch {
    return "0 GEN";
  }
  const neg = v < 0n;
  if (neg) v = -v;
  const whole = v / WEI;
  const frac = (v % WEI).toString().padStart(18, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? `.${frac.slice(0, 6)}` : ""} GEN`;
}

/** Atto from a decimal GEN string, exactly, or null when it is not a number. */
export function parseGen(text: string): bigint | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w ?? "0") * WEI + BigInt((f + "0".repeat(18)).slice(0, 18));
}

/* ---- time, spelled by hand: browsers disagree on month abbreviations ---- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

interface Parts { y: string; m: number; d: number; hh: string; mm: string }

function partsIn(date: Date, zone: string): Parts | null {
  try {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const o: Record<string, string> = {};
    for (const p of f.formatToParts(date)) o[p.type] = p.value;
    return { y: o.year ?? "", m: Number(o.month), d: Number(o.day), hh: o.hour ?? "00", mm: o.minute ?? "00" };
  } catch {
    return null;
  }
}

/** A zone as people read it: "America/New_York" becomes "America/New York". */
export const zoneName = (zone: string) => zone.replace(/_/g, " ");

export function utc(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const p = Number.isNaN(date.getTime()) ? null : partsIn(date, "UTC");
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}, ${p.hh}:${p.mm} UTC` : "";
}

/** The same instant in the case's own time zone, which the criteria are written in. */
export function local(iso: string | null | undefined, zone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = partsIn(date, zone);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}, ${p.hh}:${p.mm} (${zoneName(zone)})` : utc(iso);
}

/** The day of an instant, in UTC: "3 Oct 2026". */
export function day(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const p = Number.isNaN(date.getTime()) ? null : partsIn(date, "UTC");
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : "";
}

/** A local date or date-time the terms state, shown as the parties wrote it: "3 October 2026, 17:00 (Europe/London)". */
export function termsTime(value: string, zone: string, edge?: "start" | "end"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?$/.exec(value ?? "");
  if (!m) return "";
  const month = MONTHS_LONG[Number(m[2]) - 1] ?? "";
  // A day with no time is the whole day, as the contract tells the validators:
  // a window opens as its first day starts and a deadline falls as its day ends.
  const whole = edge === "start" ? "from the start of the day" : edge === "end" ? "until the end of the day" : "the whole day";
  return `${Number(m[3])} ${month} ${m[1]}, ${m[4] ?? whole} (${zoneName(zone)})`;
}

export function until(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "now";
  const s = Math.round(ms / 1000);
  if (s < 90) return `in ${s} seconds`;
  const m = Math.round(s / 60);
  if (m < 90) return `in ${m} minutes`;
  const h = Math.round(m / 60);
  if (h < 48) return `in ${h} hours`;
  return `in ${Math.round(h / 24)} days`;
}

export function seconds(n: number): string {
  if (n % 86400 === 0) return plural(n / 86400, "day");
  if (n % 3600 === 0) return plural(n / 3600, "hour");
  if (n % 60 === 0) return plural(n / 60, "minute");
  return plural(n, "second");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A contract refusal, without its marker, as a sentence with ids in words. */
export function sentence(text: string): string {
  const t = prose(String(text ?? "").replace("[EXPECTED]", "").replace("[LLM_ERROR]", "").trim())
    .replace(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\b/g, (iso) => utc(iso))
    .replace(/\b(\d{6,}) atto\b/g, (_, n: string) => gen(n));
  return t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : "";
}

/* ---- a transaction, named by what it did, never by what it only asked for ---- */

const TX_DONE: Record<string, string> = {
  revise_terms: "Terms revised", accept_case: "Terms accepted", decline_case: "Case declined", withdraw_case: "Case withdrawn",
  accept_inspector: "Inspector's role accepted", fund_case: "Held sum deposited", expire_case: "Draft expired",
  submit_image: "Image filed", submit_text: "Document filed", mark_ready: "Evidence marked complete", lapse_case: "Case lapsed",
  request_assessment: "Assessment recorded", challenge: "Decision challenged", readjudicate: "Readjudication recorded",
  close_challenge: "Challenge closed", finalize: "Case finalized",
};

const TX_ASKED: Record<string, string> = {
  revise_terms: "revise the terms", accept_case: "accept the terms", decline_case: "decline the case",
  withdraw_case: "withdraw the case", accept_inspector: "accept the inspector's role", fund_case: "deposit the held sum",
  expire_case: "expire the draft", submit_image: "file an image", submit_text: "file a document",
  mark_ready: "mark evidence complete", lapse_case: "lapse the case", request_assessment: "have the case assessed",
  challenge: "challenge the decision", readjudicate: "run the readjudication", close_challenge: "close the challenge",
  finalize: "finalize the case",
};

/**
 * One line for a transaction on a case. Only one the validators agreed on
 * and the contract executed is described as done; a refused or undecided one
 * is described as a request and what became of it.
 */
export function txLabel(method: string, outcome: "recorded" | "refused" | "undecided" | "unknown"): string {
  const asked = TX_ASKED[method] ?? `call ${method.replace(/_/g, " ")}`;
  if (outcome === "recorded") return TX_DONE[method] ?? `Request to ${asked}, recorded`;
  if (outcome === "refused") return `Request to ${asked}: refused by the contract`;
  if (outcome === "undecided") return `Request to ${asked}: the validators reached no decision, so nothing was recorded`;
  return `Request to ${asked}`;
}

/* ---- the case's own log, one sentence per entry ---- */

const PARTY = /the (claimant|respondent|inspector)/i;

export function eventText(e: CaseEvent, zone: string): { text: string; finding?: Finding } {
  const detail = String(e.detail ?? "");
  const version = /version (\d+)/.exec(detail)?.[1];
  const party = PARTY.exec(detail)?.[1]?.toLowerCase() ?? "";
  const did = /D-\d+/.exec(detail)?.[0] ?? "";
  const overall = (/: ([a-z_]+)$/.exec(detail)?.[1] ?? detail).toUpperCase() as Finding;
  const finding = overall in FINDING ? overall : undefined;
  switch (e.kind) {
    case "CASE_OPENED": return { text: `The claimant opened the case with terms version ${version ?? 1}.` };
    case "TERMS_REVISED": return { text: `The claimant published terms version ${version}.` };
    case "TERMS_ACCEPTED": return { text: `The respondent accepted terms version ${version}, exactly as published.` };
    case "CASE_DECLINED": return { text: "The respondent declined the case." };
    case "CASE_WITHDRAWN": return { text: "The claimant withdrew the case." };
    case "INSPECTOR_ACCEPTED": return { text: "The inspector accepted the role." };
    case "HELD_SUM_DEPOSITED": {
      const atto = /^(\d+) atto/.exec(detail)?.[1];
      return { text: `The ${party || "funder"} deposited the held sum${atto ? ` of ${gen(atto)}` : ""}.` };
    }
    case "OPENED_FOR_EVIDENCE": return { text: `Evidence opened. The evidence period ends ${local(detail, zone)}.` };
    case "CASE_EXPIRED": return { text: "The draft expired before it opened." };
    case "EVIDENCE_FILED": {
      const eid = /E-\d+/.exec(detail)?.[0];
      return { text: `The ${party} filed ${eid ? exhibitName(eid) : "an exhibit"}.` };
    }
    case "READY": return { text: `The ${party} marked their evidence complete.` };
    case "CASE_LAPSED": return { text: "Nobody asked for the assessment in time; the case lapsed." };
    case "ASSESSED": return { text: `Validators recorded ${decisionName(did)}.`, finding };
    case "CHALLENGED": return { text: `The ${party} challenged the decision.` };
    case "READJUDICATION_INCOMPLETE":
      return { text: `The readjudication in ${decisionName(detail)} could not assess the evidence; the challenged decision still stands.` };
    case "READJUDICATED": return { text: `Validators recorded ${decisionName(did)} on readjudication.`, finding };
    case "CHALLENGE_CLOSED": return { text: `The challenge closed: ${detail.replace(/^closed: /, "")}.` };
    case "FINALIZED": return { text: "The case was finalized.", finding };
    default: return { text: humanize(e.kind) + "." };
  }
}
