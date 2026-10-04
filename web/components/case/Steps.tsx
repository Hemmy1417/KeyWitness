"use client";

/**
 * What happens next on this case, and every step this wallet can take now.
 * Each button mirrors the contract's own check (lib/acts.ts); a step the
 * contract would refuse is shown with its reason instead of a button that
 * fails. Steps anyone may take (expiring a draft, lapsing, finalizing,
 * running or closing a readjudication) are listed separately.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Act } from "@/components/Act";
import { FindingChip, Icon, Note } from "@/components/bits";
import { useCase } from "./CaseFrame";
import { against } from "@/lib/acts";
import { decisionName, gen, local, plural, prose, ROLE_LABEL, STATE_HINT, until } from "@/lib/present";
import { CLOSED, type EvidenceKind, type Role } from "@/lib/types";

function Check({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 t-small">
      <span className={done ? "text-[var(--color-supported)]" : "text-[var(--color-ink-3)]"} aria-hidden="true">
        <Icon name={done ? "check" : "clock"} />
      </span>
      <span><span className="sr-only">{done ? "Done: " : "Waiting: "}</span>{children}</span>
    </li>
  );
}

export function DeclineForm() {
  const { cid, a } = useCase();
  const [reason, setReason] = useState("");
  if (!a.decline.ok) return null;
  return (
    <Act label="Decline the case" method="decline_case" can={a.decline} caseId={cid}
      prepare={() => [cid, reason.trim()]}>
      <label className="flex flex-col gap-1.5">
        <span className="t-small font-semibold">Why you decline (optional, public)</span>
        <textarea className="field" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="For example: the deadline in these terms is not the one we agreed." />
      </label>
    </Act>
  );
}

export function NextSteps() {
  const { cid, c, t, d, a, now, evidence } = useCase();
  const zone = t.time_zone;
  const held = BigInt(t.held_sum_wei || "0");
  const base = `/cases/${cid}`;
  const canFileAny = (["PHOTO", "VIDEO_FRAME", "DOCUMENT_PAGE", "TEXT_DOCUMENT"] as EvidenceKind[])
    .some((k) => a.file(k).ok);

  const mine: ReactNode[] = [];
  const anyone: ReactNode[] = [];
  let status: ReactNode = null;

  if (c.state === "DRAFT") {
    status = (
      <ul className="flex flex-col gap-2">
        <Check done={!!c.accepted_version}>The respondent accepts terms version {t.version} exactly as published.</Check>
        {t.inspector ? <Check done={c.inspector_accepted}>The named inspector accepts the role.</Check> : null}
        {held ? <Check done={BigInt(c.funded_wei || "0") > 0n}>The {t.funder.toLowerCase()} deposits the held sum of {gen(held)}.</Check> : null}
        <li className="t-micro text-[var(--color-ink-3)]">
          Evidence opens the moment every step above is done.{" "}
          {now >= new Date(c.draft_expires_at).getTime()
            ? `The draft expired ${local(c.draft_expires_at, zone)}, so it can only be closed now.`
            : `The draft expires ${local(c.draft_expires_at, zone)}.`}
        </li>
      </ul>
    );
    if (a.role === "RESPONDENT") {
      mine.push(
        <Act key="accept" label={`Accept terms version ${t.version}`} method="accept_case" args={[cid, t.digest]}
          can={a.accept} caseId={cid} primary>
          <p className="t-small text-[var(--color-ink-2)] measure">
            You accept exactly the terms on this page. The contract checks their digest, so if the claimant publishes
            another version before your acceptance lands, it is refused and you read the new version first.
          </p>
        </Act>,
        <DeclineForm key="decline" />,
      );
    }
    if (c.inspector && a.acceptInspector.ok) {
      mine.push(
        <Act key="inspector" label={`Accept the inspector role on terms version ${t.version}`} method="accept_inspector"
          args={[cid, t.digest]} can={a.acceptInspector} caseId={cid} primary>
          <p className="t-small text-[var(--color-ink-2)] measure">
            You accept the role under exactly the terms on this page; the contract checks their digest. If the claimant
            publishes another version first, your acceptance is refused and you read the new version before accepting.
          </p>
        </Act>,
      );
    }
    if (held && a.fund.ok) {
      mine.push(
        <Act key="fund" label={`Deposit ${gen(held)}`} method="fund_case" args={[cid]} value={held} can={a.fund}
          caseId={cid} primary>
          <p className="t-small text-[var(--color-ink-2)] measure">
            The contract holds this until the case ends. It goes to the claimant only if the final finding is
            supported; any recorded decision short of that sends it to the respondent. If the case never opens, or
            closes with no decision recorded at all, it comes back to you.
          </p>
        </Act>,
      );
    }
    if (a.role === "CLAIMANT") {
      if (a.revise.ok) {
        mine.push(
          <div key="revise" className="flex flex-col gap-1">
            <Link className="btn self-start" href={`/cases/new?revise=${cid}`}>Revise the terms</Link>
            <p className="t-micro text-[var(--color-ink-3)]">Publishes version {t.version + 1}; the respondent then accepts that version instead.</p>
          </div>,
        );
      }
      mine.push(<Act key="withdraw" label="Withdraw the case" method="withdraw_case" args={[cid]} can={a.withdrawCase} caseId={cid} />);
    }
    anyone.push(<Act key="expire" label="Expire this draft" method="expire_case" args={[cid]} can={a.expire} caseId={cid} />);
  }

  if (c.state === "OPEN") {
    const roles: Role[] = c.inspector ? ["CLAIMANT", "RESPONDENT", "INSPECTOR"] : ["CLAIMANT", "RESPONDENT"];
    const ended = now >= new Date(c.evidence_deadline).getTime();
    status = (
      <ul className="flex flex-col gap-2">
        <li className="t-small font-semibold">
          {ended ? `The evidence period ended ${local(c.evidence_deadline, zone)}.`
            : `The evidence period ends ${local(c.evidence_deadline, zone)}, ${until(c.evidence_deadline, now)}.`}
        </li>
        {roles.map((r) => (
          <Check key={r} done={c.ready[r]}>
            The {ROLE_LABEL[r].toLowerCase()} {c.ready[r] ? "has marked their evidence complete" : "may still file"}.
          </Check>
        ))}
        <li className="t-micro text-[var(--color-ink-3)]">
          New evidence from anyone clears every mark, so each side can answer it. Once everyone has marked their evidence
          complete, or the period has ended, either party can ask for the assessment. If nothing at all was filed, the
          contract records that nothing was established, without asking any validator.
        </li>
      </ul>
    );
    if (a.role) {
      mine.push(
        <div key="file" className="flex flex-col gap-1">
          {canFileAny ? <Link className="btn btn-primary self-start" href={`${base}/evidence`}>File evidence</Link>
            : <button type="button" className="btn self-start" disabled>File evidence</button>}
          {!canFileAny ? <p className="t-micro text-[var(--color-ink-3)]">{a.file(t.allowed[0] ?? "PHOTO").why}</p> : null}
        </div>,
        <Act key="ready" label="Mark my evidence complete" method="mark_ready" args={[cid]} can={a.ready} caseId={cid} />,
      );
    }
    if (a.role === "CLAIMANT" || a.role === "RESPONDENT") {
      mine.push(
        <div key="assess" className="flex flex-col gap-1">
          <Link className={`btn self-start ${a.assess.ok ? "btn-primary" : ""}`} href={`${base}/decision`}>
            {a.assess.ok ? "Ask for the assessment" : "Assessment"}
          </Link>
          {!a.assess.ok ? <p className="t-micro text-[var(--color-ink-3)]">{a.assess.why}</p> : null}
        </div>,
      );
    }
    anyone.push(
      <Act key="lapse" label="Lapse the case" method="lapse_case" args={[cid]} can={a.lapse} caseId={cid}>
        <p className="t-micro text-[var(--color-ink-3)] measure">
          Three days after the evidence period, if neither party asked for the assessment, anyone can close the case.
          Nothing was decided, so any held sum goes back to whoever deposited it.
        </p>
      </Act>,
    );
  }

  if (c.state === "DETERMINED" && d) {
    const open = now < new Date(d.challenge_window_ends).getTime();
    const side = against(d).toLowerCase();
    const unseen = d.unseen_ids.length;
    status = (
      <div className="flex flex-col gap-2">
        <p className="t-small flex flex-wrap items-center gap-2">
          {decisionName(d.decision_id)} stands: <FindingChip value={d.overall} size="sm" />
        </p>
        <p className="t-small">
          {c.challenge ? "It was reached on a challenge, which is the last word. Anyone can finalize the case."
            : open ? `The ${side} can challenge it until ${local(d.challenge_window_ends, zone)}, ${until(d.challenge_window_ends, now)}.`
              : "The challenge window has closed. Anyone can finalize the case."}
        </p>
        {!c.challenge && open && (d.overall === "NOT_ASSESSED" || unseen) ? (
          <p className="t-small">
            {d.overall === "NOT_ASSESSED" ? "The validators could not examine any of the evidence."
              : `The validators could not see ${plural(unseen, "image")}.`}{" "}
            {c.retried_by.includes(d.overall === "SUPPORTED" ? "RESPONDENT" : "CLAIMANT")
              ? `The ${side} has already asked for the assessment again once, so the way to contest this decision is a challenge.`
              : `The ${side} can also ask for the assessment again, once, without a bond.`}
          </p>
        ) : null}
      </div>
    );
    if (a.role === "CLAIMANT" || a.role === "RESPONDENT") {
      mine.push(
        <div key="decision" className="flex flex-col gap-1">
          <Link className={`btn self-start ${a.challenge.ok || a.assess.ok ? "btn-primary" : ""}`} href={`${base}/decision`}>
            {a.challenge.ok ? "Read the decision and challenge it" : a.assess.ok ? "Ask for the assessment again" : "Read the decision"}
          </Link>
          {!a.challenge.ok && !a.assess.ok && open ? (
            <p className="t-micro text-[var(--color-ink-3)]">{a.challenge.why}</p>
          ) : null}
        </div>,
      );
    }
    anyone.push(
      <Act key="finalize" label="Finalize the case" method="finalize" args={[cid]} can={a.finalize} caseId={cid}>
        <p className="t-micro text-[var(--color-ink-3)] measure">
          Finalizing makes the standing decision the last word and moves any held sum by the agreed rule.
        </p>
      </Act>,
    );
  }

  if (c.state === "UNDER_CHALLENGE" && c.challenge) {
    const ch = c.challenge;
    const filing = now < new Date(ch.evidence_ends).getTime();
    const replying = !filing && now < new Date(ch.reply_ends).getTime();
    const other = ch.by === "CLAIMANT" ? "respondent" : "claimant";
    status = (
      <div className="flex flex-col gap-2">
        <p className="t-small">
          The {ch.by.toLowerCase()} challenged {decisionName(ch.decision_challenged)} {local(ch.opened_at, zone)} and posted
          a bond of {gen(ch.bond_wei)}.
        </p>
        <blockquote className="t-small border-l-2 border-[var(--color-rule)] pl-3 text-[var(--color-ink-2)]">{ch.reason}</blockquote>
        <p className="t-small">
          {filing ? `The ${ch.by.toLowerCase()} may add new evidence until ${local(ch.evidence_ends, zone)}, ${until(ch.evidence_ends, now)}. The ${other}${c.inspector ? " and the inspector" : ""} may answer it until ${local(ch.reply_ends, zone)}.`
            : replying ? `The ${ch.by.toLowerCase()}'s time to file ended ${local(ch.evidence_ends, zone)}. The ${other}${c.inspector ? " and the inspector" : ""} may answer until ${local(ch.reply_ends, zone)}, ${until(ch.reply_ends, now)}.`
              : `New evidence closed ${local(ch.reply_ends, zone)}. The readjudication can run until ${local(ch.close_after, zone)}.`}
        </p>
        <p className="t-micro text-[var(--color-ink-3)]">
          The case is judged again only if the challenger filed something new, and anyone, either side included, can
          run the readjudication. The bond comes back only if it reverses the decision; if no readjudication is ever
          recorded, the decision stands and the bond is returned.
        </p>
      </div>
    );
    if (a.role) {
      mine.push(
        <div key="file" className="flex flex-col gap-1">
          {canFileAny ? <Link className="btn btn-primary self-start" href={`${base}/evidence`}>Add new evidence</Link>
            : <button type="button" className="btn self-start" disabled>Add new evidence</button>}
          {!canFileAny ? <p className="t-micro text-[var(--color-ink-3)]">{a.file(t.allowed[0] ?? "PHOTO").why}</p> : null}
        </div>,
      );
    }
    anyone.push(
      <div key="readjudicate" className="flex flex-col gap-1">
        <Link className={`btn self-start ${a.readjudicate.ok ? "btn-primary" : ""}`} href={`${base}/decision`}>
          {a.readjudicate.ok ? "Run the readjudication" : "Readjudication"}
        </Link>
        {!a.readjudicate.ok ? <p className="t-micro text-[var(--color-ink-3)]">{a.readjudicate.why}</p> : null}
      </div>,
      <Act key="close" label="Close the challenge" method="close_challenge" args={[cid]} can={a.closeChallenge} caseId={cid} />,
    );
  }

  if (c.state === "FINAL" && d) {
    status = (
      <div className="flex flex-col gap-2">
        <p className="t-small flex flex-wrap items-center gap-2">Final finding: <FindingChip value={d.overall} size="sm" /></p>
        {c.settlement ? (
          <p className="t-small">
            The held sum of {gen(c.settlement.held_sum_wei)} went{" "}
            {c.settlement.to_role === "DEPOSITOR" ? "back to whoever deposited it" : `to the ${c.settlement.to_role.toLowerCase()}`}{" "}
            because {prose(c.settlement.why).split(", so the held sum")[0]}.
          </p>
        ) : <p className="t-small">No money rode on this case.</p>}
        <Link className="btn btn-primary self-start" href={`${base}/receipt`}>Get the receipt</Link>
      </div>
    );
  }

  if (["DECLINED", "WITHDRAWN", "EXPIRED", "LAPSED"].includes(c.state)) {
    status = (
      <div className="flex flex-col gap-2">
        {c.state === "DECLINED" && c.closed_reason ? (
          <blockquote className="t-small border-l-2 border-[var(--color-rule)] pl-3 text-[var(--color-ink-2)]">{c.closed_reason}</blockquote>
        ) : null}
        {c.settlement ? (
          <p className="t-small">
            The held sum of {gen(c.settlement.held_sum_wei)} went{" "}
            {c.settlement.to_role === "DEPOSITOR" ? "back to whoever deposited it" : `to the ${c.settlement.to_role.toLowerCase()}`}:{" "}
            {prose(c.settlement.why).split(", so the held sum")[0]}.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="t-small text-[var(--color-ink-2)] measure">{STATE_HINT[c.state]}</p>
      {status}
      {mine.length ? (
        <div className="flex flex-col gap-4">
          <h3 className="t-h3">Your steps</h3>
          {mine}
        </div>
      ) : a.role ? null : !CLOSED.includes(c.state) ? (
        <Note title="Only the parties named in the terms act on this case.">
          <p>{evidence.length ? "You can follow it here and take the steps anyone may take." : "You can follow it here."}</p>
        </Note>
      ) : null}
      {anyone.length ? (
        <div className="flex flex-col gap-4">
          <h3 className="t-h3">Steps anyone can take</h3>
          {anyone}
        </div>
      ) : null}
    </div>
  );
}
