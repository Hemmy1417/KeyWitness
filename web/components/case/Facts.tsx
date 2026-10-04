"use client";

/**
 * The case at a glance: where it is in its life, who holds which role, what
 * money rides on it and which windows bind it. Addresses and digests are in
 * the verification fold only.
 */
import { Fold, Machine } from "@/components/bits";
import { useCase } from "./CaseFrame";
import { txUrl, EXPLORER } from "@/lib/chain";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { caseName, gen, local, ROLE_LABEL, seconds, utc } from "@/lib/present";
import { useSent } from "@/lib/sent";
import type { CaseState } from "@/lib/types";

type Stage = { label: string; state?: "done" | "now" | "bad"; note?: string };

const CLOSED: Partial<Record<CaseState, string>> = {
  DECLINED: "Declined by the respondent", WITHDRAWN: "Withdrawn by the claimant",
  EXPIRED: "Expired as a draft", LAPSED: "Lapsed: nobody asked for the assessment",
};

export function CaseRail() {
  const { c } = useCase();
  const s = c.state;
  const stages: Stage[] = [];
  const draftDone = !!c.accepted_version && s !== "DRAFT";
  stages.push({ label: "Terms agreed", state: s === "DRAFT" ? "now" : draftDone ? "done" : "bad",
    note: CLOSED[s] && !draftDone ? CLOSED[s] : undefined });
  if (draftDone) {
    const evidenceDone = !["OPEN", "LAPSED"].includes(s);
    stages.push({ label: "Evidence filed", state: s === "OPEN" ? "now" : s === "LAPSED" ? "bad" : evidenceDone ? "done" : undefined,
      note: s === "LAPSED" ? CLOSED.LAPSED : undefined });
  } else stages.push({ label: "Evidence filed" });
  const decided = c.decisions.length > 0;
  stages.push({ label: "Decision recorded", state: s === "DETERMINED" ? "now" : decided ? "done" : undefined });
  if (c.challenge) {
    stages.push({ label: "Challenge", state: s === "UNDER_CHALLENGE" ? "now" : "done" });
  }
  stages.push({ label: "Final", state: s === "FINAL" ? "done" : undefined });
  return (
    <ol className="rail flex flex-col gap-3" aria-label="Where this case is">
      {stages.map((x) => (
        <li key={x.label} className="rail-node flex flex-col" data-state={x.state}>
          <span className={`t-small ${x.state === "now" ? "font-semibold" : ""}`}>
            {x.label}{x.state === "now" ? " (now)" : ""}
          </span>
          {x.note ? <span className="t-micro text-[var(--color-ink-3)]">{x.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function Parties() {
  const { c, t, addr } = useCase();
  const me = (a: string) => !!addr && !!a && a.toLowerCase() === addr.toLowerCase();
  const rows: { role: string; who: string; note?: string }[] = [
    { role: ROLE_LABEL.CLAIMANT, who: c.claimant, note: "Wrote the terms and makes the claim." },
    { role: ROLE_LABEL.RESPONDENT, who: c.respondent,
      note: c.accepted_version ? "Accepted the terms." : c.state === "DECLINED" ? "Declined the terms."
        : c.state === "DRAFT" ? "Has not accepted the terms yet." : "Did not accept the terms before the case closed." },
  ];
  if (t.inspector) {
    rows.push({ role: ROLE_LABEL.INSPECTOR, who: t.inspector,
      note: c.inspector_accepted ? "Independent of both parties; accepted the role."
        : c.state === "DRAFT" ? "Named in the terms; has not accepted yet." : "Named in the terms; did not accept the role." });
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.role} className="flex flex-col">
          <span className="t-small font-semibold">{r.role}{me(r.who) ? " (you)" : ""}</span>
          {r.note ? <span className="t-micro text-[var(--color-ink-3)]">{r.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function Money() {
  const { c, t } = useCase();
  const held = BigInt(t.held_sum_wei || "0");
  return (
    <dl className="flex flex-col gap-2">
      <div>
        <dt className="t-micro text-[var(--color-ink-3)]">Held sum</dt>
        <dd className="t-small">
          {held ? <>{gen(held)}, deposited by the {t.funder.toLowerCase()}. </> : "None: this case is a record only. "}
          {held ? (c.settlement ? <>Paid to the {c.settlement.to_role === "DEPOSITOR" ? "depositor" : c.settlement.to_role.toLowerCase()} {utc(c.settlement.at)}.</>
            : BigInt(c.funded_wei || "0") ? "Held by the contract." : "Not deposited yet.") : null}
        </dd>
      </div>
      {held ? (
        <p className="t-micro text-[var(--color-ink-3)]">
          It goes to the claimant only if the final finding is supported, and to the respondent on any recorded
          decision short of that, including that the evidence could not be examined. If the case closes with no
          decision recorded at all, it goes back to whoever deposited it.
        </p>
      ) : null}
      <div>
        <dt className="t-micro text-[var(--color-ink-3)]">Challenge bond</dt>
        <dd className="t-small">{gen(t.challenge_bond_wei)}{c.challenge ? `, posted by the ${c.challenge.by.toLowerCase()}` : ""}</dd>
      </div>
    </dl>
  );
}

export function Windows() {
  const { c, t, d } = useCase();
  const zone = t.time_zone;
  return (
    <dl className="flex flex-col gap-2">
      <div>
        <dt className="t-micro text-[var(--color-ink-3)]">Evidence period</dt>
        <dd className="t-small">{c.evidence_deadline ? `Ends ${local(c.evidence_deadline, zone)}` : seconds(t.evidence_period_seconds) + " from opening"}</dd>
      </div>
      <div>
        <dt className="t-micro text-[var(--color-ink-3)]">Challenge window</dt>
        <dd className="t-small">{d && c.state === "DETERMINED" ? `Closes ${local(d.challenge_window_ends, zone)}` : seconds(t.challenge_window_seconds) + " after a decision"}</dd>
      </div>
      <div>
        <dt className="t-micro text-[var(--color-ink-3)]">New evidence in a challenge</dt>
        <dd className="t-small">{seconds(t.challenge_evidence_seconds)}</dd>
      </div>
      {c.state === "DRAFT" ? (
        <div>
          <dt className="t-micro text-[var(--color-ink-3)]">Draft expires</dt>
          <dd className="t-small">{local(c.draft_expires_at, zone)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function VerifyCase() {
  const { cid, c, t } = useCase();
  const mine = useSent(cid);
  return (
    <Fold summary={`Verify ${caseName(cid)}`}>
      <Machine label="Case id" value={cid} />
      <Machine label="Contract" value={CONTRACT_ADDRESS} href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} />
      <Machine label="Claimant" value={c.claimant} />
      <Machine label="Respondent" value={c.respondent} />
      {t.inspector ? <Machine label="Inspector" value={t.inspector} /> : null}
      <Machine label={`Terms version ${t.version} digest`} value={t.digest} />
      {c.accepted_digest ? <Machine label="Digest the respondent accepted" value={c.accepted_digest} /> : null}
      {mine.length ? (
        <div className="flex flex-col gap-1 pt-3">
          <span className="t-micro text-[var(--color-ink-3)]">Transactions sent from this browser for this case</span>
          {mine.map((s) => (
            <a key={s.hash} className="link t-mono break-all" href={txUrl(s.hash)} target="_blank" rel="noreferrer">
              {s.method}: {s.hash}
            </a>
          ))}
        </div>
      ) : null}
      <p className="t-micro text-[var(--color-ink-3)] pt-3">
        Every value above can be read straight from the contract with the get_case and get_terms views.
      </p>
    </Fold>
  );
}
