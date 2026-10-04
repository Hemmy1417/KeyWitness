/**
 * What a wallet can do on a case right now, decided from chain state alone
 * Each rule mirrors the contract's own check, in the
 * same order, and an act the contract would refuse is returned with the
 * contract's reason in words instead of a button that fails.
 *
 * Pure: (case, accepted terms, standing decision, evidence, address, clock,
 * owed) in, availability out. The live proofs load these exact rules and
 * assert them against the chain at every stage.
 */
import type { Case, Decision, Evidence, EvidenceKind, Role, Terms } from "./types";

export interface Can {
  ok: boolean;
  why: string;
}

const yes: Can = { ok: true, why: "" };
const no = (why: string): Can => ({ ok: false, why });

const ms = (iso: string) => new Date(iso).getTime();

export const IMAGE_KINDS: EvidenceKind[] = ["PHOTO", "VIDEO_FRAME", "DOCUMENT_PAGE"];
export const CAPS: Record<Role, [number, number]> = { CLAIMANT: [5, 4], RESPONDENT: [5, 4], INSPECTOR: [3, 3] };
export const CHALLENGE_CAPS: [number, number] = [2, 2];
/** How often each side may ask for an assessment again. */
export const MAX_RETRIES = 1;
export const MAX_READJUDICATIONS = 3;
export const MAX_VERSIONS = 20;
export const LAPSE_GRACE_MS = 3 * 86400 * 1000;

export function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** The wallet's role on the case, as the contract's _role computes it. */
export function roleOf(c: Case, addr: string): Role | "" {
  if (same(addr, c.claimant)) return "CLAIMANT";
  if (same(addr, c.respondent)) return "RESPONDENT";
  if (c.inspector && same(addr, c.inspector) && c.inspector_accepted) return "INSPECTOR";
  return "";
}

/** The side a decision went against: the respondent for SUPPORTED, the claimant otherwise. */
export function against(d: Decision): "CLAIMANT" | "RESPONDENT" {
  return d.overall === "SUPPORTED" ? "RESPONDENT" : "CLAIMANT";
}

export interface ActsInput {
  c: Case;
  /** The current terms version (for a draft) or the accepted one. */
  t: Terms;
  /** The standing decision, when the case has one. */
  d: Decision | null;
  evidence: Evidence[];
  addr: string;
  now: number;
  owed?: bigint;
}

export interface Acts {
  role: Role | "";
  revise: Can;
  accept: Can;
  decline: Can;
  withdrawCase: Can;
  acceptInspector: Can;
  fund: Can;
  expire: Can;
  file: (kind: EvidenceKind) => Can;
  ready: Can;
  assess: Can;
  lapse: Can;
  challenge: Can;
  readjudicate: Can;
  closeChallenge: Can;
  finalize: Can;
  withdraw: Can;
}

export function brought(c: Case, evidence: Evidence[]): boolean {
  if (!c.challenge) return false;
  return evidence.some((e) => e.during_challenge && e.role === c.challenge?.by);
}

export function acts({ c, t, d, evidence, addr, now, owed = 0n }: ActsInput): Acts {
  const role = roleOf(c, addr);
  const isClaimant = same(addr, c.claimant);
  const isRespondent = same(addr, c.respondent);
  const draftOpen = c.state === "DRAFT" && !c.accepted_version;
  // A draft is good for seven days; after that it can only be closed.
  const expired = c.state === "DRAFT" && now >= ms(c.draft_expires_at);
  const EXPIRED = "This draft has expired; anyone can close it.";

  const revise = !addr ? no("Connect a wallet.")
    : !isClaimant ? no("Only the claimant revises the terms.")
      : !draftOpen ? no("The terms are frozen once the respondent has accepted them.")
        : expired ? no(EXPIRED)
          : c.version >= MAX_VERSIONS ? no(`A case may have at most ${MAX_VERSIONS} versions of its terms.`) : yes;

  const accept = !addr ? no("Connect a wallet.")
    : !isRespondent ? no("Only the named respondent accepts the terms.")
      : !draftOpen ? no("These terms are no longer awaiting acceptance.")
        : expired ? no(EXPIRED) : yes;

  const decline = !addr ? no("Connect a wallet.")
    : !isRespondent ? no("Only the named respondent declines the case.")
      : !draftOpen ? no("Only terms still awaiting acceptance can be declined.") : yes;

  const withdrawCase = !addr ? no("Connect a wallet.")
    : !isClaimant ? no("Only the claimant withdraws the case.")
      : c.state !== "DRAFT" ? no("A case can be withdrawn only before it opens for evidence.") : yes;

  const acceptInspector = !addr ? no("Connect a wallet.")
    : !c.inspector || !same(addr, c.inspector) ? no("Only the inspector named in the terms accepts the role.")
      : c.state !== "DRAFT" ? no("The inspector role can be accepted only while the case is a draft.")
        : c.inspector_accepted ? no("The inspector has already accepted.")
          : expired ? no(EXPIRED) : yes;

  const held = BigInt(t.held_sum_wei || "0");
  const funder = t.funder === "CLAIMANT" ? c.claimant : t.funder === "RESPONDENT" ? c.respondent : "";
  const fund = !addr ? no("Connect a wallet.")
    : c.state !== "DRAFT" || !c.accepted_version ? no("The held sum is deposited after acceptance and before the case opens.")
      : expired ? no(EXPIRED)
      : !held ? no("These terms carry no held sum.")
        : BigInt(c.funded_wei || "0") ? no("The held sum is already deposited.")
          : !same(addr, funder) ? no(`The terms say the ${t.funder.toLowerCase()} deposits the held sum.`) : yes;

  const expire = c.state !== "DRAFT" ? no("Only a draft can expire.")
    : now < ms(c.draft_expires_at) ? no("The draft stays open for seven days from when it was written.") : yes;

  const counts = role ? (c.counts[role] ?? { img: 0, doc: 0, cimg: 0, cdoc: 0 }) : { img: 0, doc: 0, cimg: 0, cdoc: 0 };
  const file = (kind: EvidenceKind): Can => {
    if (!addr) return no("Connect a wallet.");
    if (!role) return no("Only the claimant, the respondent or an accepted inspector files evidence.");
    if (!c.accepted_version) return no("The respondent has not accepted terms for this case.");
    if (!t.allowed.includes(kind)) return no("These terms do not allow this kind of evidence.");
    const img = IMAGE_KINDS.includes(kind);
    if (c.state === "OPEN") {
      if (now >= ms(c.evidence_deadline)) return no("The evidence period has ended.");
      const cap = CAPS[role][img ? 0 : 1];
      if ((img ? counts.img : counts.doc) >= cap) return no(`You have filed the most ${img ? "images" : "documents"} allowed.`);
      return yes;
    }
    if (c.state === "UNDER_CHALLENGE" && c.challenge) {
      // The challenger files first; the other side and the inspector have as long again to answer.
      if (role === c.challenge.by) {
        if (now >= ms(c.challenge.evidence_ends)) return no("The challenger's time to file new evidence has ended.");
      } else if (now >= ms(c.challenge.reply_ends)) return no("The time to answer the challenge has ended.");
      const cap = CHALLENGE_CAPS[img ? 0 : 1];
      if ((img ? counts.cimg : counts.cdoc) >= cap) return no(`You have added the most ${img ? "images" : "documents"} a challenge allows.`);
      return yes;
    }
    return no("Evidence is filed while the case is open or under challenge.");
  };

  const ready = !addr ? no("Connect a wallet.")
    : !role ? no("Only a party or the accepted inspector marks their evidence complete.")
      : c.state !== "OPEN" ? no("Readiness is marked while the case is open for evidence.")
        : c.ready[role] ? no("You have already marked your evidence complete.") : yes;

  let assess: Can;
  if (!addr) assess = no("Connect a wallet.");
  else if (role !== "CLAIMANT" && role !== "RESPONDENT") assess = no("Only the claimant or the respondent asks for the assessment.");
  else if (!c.accepted_version) assess = no("The respondent has not accepted terms for this case.");
  else if (c.state === "OPEN") {
    const allReady = c.ready.CLAIMANT && c.ready.RESPONDENT && (!c.inspector || c.ready.INSPECTOR);
    if (now < ms(c.evidence_deadline) && !allReady) {
      assess = no("The evidence period is still running, unless every party marks their evidence complete first.");
    } else assess = yes;
  } else if (c.state === "DETERMINED" && d) {
    // A decision reached without seeing every image may be asked for again, free of any bond,
    // by the side it went against. Each side may do so once.
    if (c.challenge || (d.overall !== "NOT_ASSESSED" && !d.unseen_ids.length)) {
      assess = no("No image went unexamined in this decision, so it cannot be asked for again; the way to contest it is a challenge.");
    } else if (role !== against(d)) {
      assess = no(`Only the ${against(d).toLowerCase()}, whom this decision went against, can ask for it again.`);
    } else if (c.retried_by.filter((r) => r === role).length >= MAX_RETRIES) {
      assess = no(`The ${role.toLowerCase()} has already asked for the assessment again; the way to contest this decision is a challenge.`);
    } else if (now >= ms(d.challenge_window_ends)) assess = no("The window to retry the assessment has closed.");
    else assess = yes;
  } else assess = no("The assessment is requested while the case is open.");

  const lapse = c.state !== "OPEN" ? no("Only an open case can lapse.")
    : now < ms(c.evidence_deadline) + LAPSE_GRACE_MS ? no("Either party can still ask for the assessment.") : yes;

  let challenge: Can;
  if (!addr) challenge = no("Connect a wallet.");
  else if (c.state !== "DETERMINED" || !d) challenge = no("Only a standing decision can be challenged.");
  else if (c.challenge) challenge = no("This case has already been challenged once.");
  else if (now >= ms(d.challenge_window_ends)) challenge = no("The challenge window has closed.");
  else if (role !== against(d)) challenge = no(`Only the ${against(d).toLowerCase()}, whom this decision went against, challenges it.`);
  else challenge = yes;

  const ch = c.challenge;
  let readjudicate: Can;
  if (c.state !== "UNDER_CHALLENGE" || !ch) readjudicate = no("Only a case under challenge is readjudicated.");
  else if (now < ms(ch.evidence_ends)) readjudicate = no("The challenger may still file new evidence.");
  else if (!brought(c, evidence)) readjudicate = no("The challenger filed no new evidence, so there is nothing to judge again.");
  else if (now < ms(ch.reply_ends)) readjudicate = no("The other side may still answer the new evidence.");
  else if (now >= ms(ch.close_after)) readjudicate = no("The readjudication window has closed; the challenge can be closed.");
  else if (ch.rounds >= MAX_READJUDICATIONS) readjudicate = no("The readjudication has been tried the most times allowed; the challenge can be closed.");
  else readjudicate = yes;

  let closeChallenge: Can;
  if (c.state !== "UNDER_CHALLENGE" || !ch) closeChallenge = no("Only a case under challenge has a challenge to close.");
  else if (now < ms(ch.evidence_ends)) closeChallenge = no("The challenge evidence period is still running.");
  else if (!brought(c, evidence)) closeChallenge = yes;
  else if (now >= ms(ch.close_after) || ch.rounds >= MAX_READJUDICATIONS) closeChallenge = yes;
  else closeChallenge = no("New evidence was filed, so anyone can run the readjudication first.");

  const finalize = c.state !== "DETERMINED" || !d ? no("Only a case with a standing decision can be finalized.")
    : now < ms(d.challenge_window_ends) ? no("The decision can still be challenged.") : yes;

  const withdraw = !addr ? no("Connect a wallet.") : owed > 0n ? yes : no("Nothing is owed to this wallet.");

  return { role, revise, accept, decline, withdrawCase, acceptInspector, fund, expire, file, ready, assess, lapse,
    challenge, readjudicate, closeChallenge, finalize, withdraw };
}
