"use client";

import { useState } from "react";

import { Act } from "@/components/Act";
import { FindingChip, Loading, Note, ReadFailure, Section } from "@/components/bits";
import { useCase } from "@/components/case/CaseFrame";
import { DecisionView } from "@/components/case/DecisionView";
import { Completeness } from "@/components/case/Exhibits";
import { ProtocolRecord } from "@/components/case/ProtocolRecord";
import { against } from "@/lib/acts";
import { decisionName, exhibitName, gen, local, plural, prose, ROLE_LABEL, seconds, until } from "@/lib/present";
import { getDecision } from "@/lib/read";
import { useChain } from "@/lib/useChain";

const WORKING = "Validators are examining each photograph, then judging every criterion against all the evidence. "
  + "This usually takes a few minutes.";

function AskForAssessment() {
  const { cid, c, a, evidence } = useCase();
  const roles = ["CLAIMANT", "RESPONDENT", "INSPECTOR"] as const;
  return (
    <div className="flex flex-col gap-5">
      <p className="t-small text-[var(--color-ink-2)] measure">
        {plural(evidence.length, "exhibit")} filed:{" "}
        {roles.filter((r) => evidence.some((e) => e.role === r))
          .map((r) => `${evidence.filter((e) => e.role === r).length} by the ${ROLE_LABEL[r].toLowerCase()}`).join(", ") || "none yet"}.
      </p>
      <div className="flex flex-col gap-2">
        <h3 className="t-h3">Required evidence</h3>
        <Completeness />
      </div>
      <Act label={c.state === "DETERMINED" ? "Ask for the assessment again" : "Ask for the assessment"}
        method="request_assessment" args={[cid]} can={a.assess} caseId={cid} offerAppeal primary working={WORKING}>
        <p className="t-small text-[var(--color-ink-2)] measure">
          Validators chosen by the network, not by either side, each run the assessment and must agree, by majority,
          on which criteria are supported. If they cannot agree, nothing is recorded and you can ask again. A decision
          reached without seeing every image can be asked for again, once, by the side it went against. If
          nothing was filed at all, the contract records that nothing was established without asking them.
        </p>
      </Act>
    </div>
  );
}

function ChallengeSection() {
  const { cid, c, t, d, a, now } = useCase();
  const [reason, setReason] = useState("");
  const bond = BigInt(t.challenge_bond_wei);
  const zone = t.time_zone;
  const ch = c.challenge;

  // A challenge that has ended: what happened and where the bond went.
  if (ch && c.state !== "UNDER_CHALLENGE") {
    return (
      <div className="flex flex-col gap-3">
        <p className="t-small measure">
          The {ch.by.toLowerCase()} challenged {decisionName(ch.decision_challenged)} {local(ch.opened_at, zone)}, posting{" "}
          {gen(ch.bond_wei)}. The challenge {prose(ch.outcome).replace(/^closed: /, "was closed: ")}
          {ch.outcome.startsWith("closed") ? "" : " on readjudication"}, and the bond went{" "}
          {ch.bond_to === "CHALLENGER" ? "back to the challenger" : `to the ${String(ch.bond_to).toLowerCase()}`}.
        </p>
        <blockquote className="t-small border-l-2 border-[var(--color-rule)] pl-3 text-[var(--color-ink-2)]">{ch.reason}</blockquote>
        <p className="t-micro text-[var(--color-ink-3)]">A case can be challenged once.</p>
      </div>
    );
  }
  if (!d || c.state !== "DETERMINED") return null;
  const side = against(d);
  const open = now < new Date(d.challenge_window_ends).getTime();
  if (!open) {
    return (
      <p className="t-small measure">
        The challenge window closed {local(d.challenge_window_ends, zone)} and nobody challenged this decision. Anyone can
        finalize the case.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="t-small text-[var(--color-ink-2)] measure">
        This decision went against the {side.toLowerCase()}, who alone may challenge it, once, until{" "}
        {local(d.challenge_window_ends, zone)}, by posting the bond of {gen(bond)}. The challenger then has{" "}
        {seconds(t.challenge_evidence_seconds)} to add up to two images and two documents, and the other side has as
        long again to answer. The case is judged again only if the challenger adds something new. The bond comes back
        if the new decision reverses which side this one favours. It also comes back if no round gives a result
        through no fault of the challenger: none was run, or one examined everything new and still could not see
        images this decision saw. It goes to the other side if the new decision keeps the same side, if nothing new
        is filed, or if what is filed could not be examined.
      </p>
      <Act label={`Challenge and post ${gen(bond)}`} method="challenge" value={bond} can={a.challenge} caseId={cid}
        prepare={() => (reason.trim().length < 10 ? "State the reason in at least 10 characters." : [cid, reason.trim()])}>
        <label className="flex flex-col gap-1.5">
          <span className="t-small font-semibold">Why the decision is wrong (public)</span>
          <textarea className="field" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="For example: the inspection report predates the second visit, when the remaining slates were fixed." />
          <span className="t-micro text-[var(--color-ink-3)]">Your reason is argument, not evidence; the validators are told so. Add the evidence itself after challenging.</span>
        </label>
      </Act>
    </div>
  );
}

function OtherDecision({ did }: { did: string }) {
  const { t, evidence } = useCase();
  const read = useChain(`decision.${did}`, (fresh) => getDecision(did, fresh));
  if (read.error && !read.data) return <ReadFailure what={decisionName(did)} error={read.error} retrying={read.retrying} />;
  if (!read.data) return <Loading what={decisionName(did)} />;
  return <DecisionView d={read.data} evidence={evidence} zone={t.time_zone} />;
}

export default function DecisionPage() {
  const { cid, c, t, d, a, now, evidence } = useCase();
  const [picked, setPicked] = useState<string | null>(null);
  const viewing = picked && picked !== c.standing ? picked : null;
  const zone = t.time_zone;
  const ch = c.challenge;

  return (
    <div className="flex flex-col gap-12">
      {c.state === "OPEN" ? (
        <Section title="Ask for the assessment" aside={`Evidence ${now < new Date(c.evidence_deadline).getTime() ? `closes ${until(c.evidence_deadline, now)}` : "period ended"}`}>
          <AskForAssessment />
        </Section>
      ) : null}

      {!d && c.state !== "OPEN" ? (
        <Note title="No decision on this case.">
          <p>{c.state === "DRAFT" ? "Evidence opens once the terms are accepted and any held sum is deposited." : "This case closed before any assessment."}</p>
        </Note>
      ) : null}

      {d ? (
        <Section title={viewing ? "An earlier decision" : c.state === "FINAL" ? "The final decision" : "The standing decision"}
          aside={c.decisions.length > 1 ? (
            <label className="flex items-center gap-2">
              <span>Show</span>
              <select className="field !min-h-0 !py-1" value={viewing ?? c.standing} onChange={(e) => setPicked(e.target.value)}>
                {[...c.decisions].reverse().map((x) => (
                  <option key={x} value={x}>{decisionName(x)}{x === c.standing ? (c.state === "FINAL" ? " (final)" : " (standing)") : ""}</option>
                ))}
              </select>
            </label>
          ) : undefined}>
          {viewing ? <OtherDecision did={viewing} /> : <DecisionView d={d} evidence={evidence} zone={zone} />}
        </Section>
      ) : null}

      {c.state === "DETERMINED" && d && !ch && (d.overall === "NOT_ASSESSED" || d.unseen_ids.length) ? (
        <Section title="Ask for the assessment again" aside={`${plural(Math.max(0, 2 - c.retries_used), "attempt")} left`}>
          <p className="t-small text-[var(--color-ink-2)] measure">
            {d.overall === "NOT_ASSESSED" ? "The validators could not examine any of the evidence."
              : `The validators could not see ${d.unseen_ids.map(exhibitName).join(", ")}, so ${d.unseen_ids.length === 1 ? "it" : "they"} counted for nothing.`}{" "}
            The {against(d).toLowerCase()}, whom this decision went against, can ask for the assessment again without
            posting a bond, until the challenge window closes. The new decision replaces this one; both stay on the
            record.
          </p>
          <AskForAssessment />
        </Section>
      ) : null}

      {d && (c.state === "DETERMINED" || (ch && c.state !== "UNDER_CHALLENGE")) ? (
        <Section title="Challenge" aside={c.state === "DETERMINED" && !ch
          ? (now < new Date(d.challenge_window_ends).getTime() ? `Window closes ${until(d.challenge_window_ends, now)}` : "Window closed")
          : undefined}>
          <ChallengeSection />
        </Section>
      ) : null}

      {c.state === "UNDER_CHALLENGE" && ch ? (
        <Section title="Under challenge">
          <div className="flex flex-col gap-4">
            <p className="t-small measure">
              The {ch.by.toLowerCase()} challenged {decisionName(ch.decision_challenged)} {local(ch.opened_at, zone)}, posting
              {" "}{gen(ch.bond_wei)}.
              {now < new Date(ch.evidence_ends).getTime()
                ? ` The challenger may add new evidence until ${local(ch.evidence_ends, zone)}; the other side may answer until ${local(ch.reply_ends, zone)}.`
                : now < new Date(ch.reply_ends).getTime()
                  ? ` The challenger's time to file has ended; the other side may answer until ${local(ch.reply_ends, zone)}.`
                  : ` New evidence closed ${local(ch.reply_ends, zone)}; the readjudication can run until ${local(ch.close_after, zone)}.`}
              {ch.rounds ? ` ${plural(ch.rounds, "round")} so far could not examine what ${ch.rounds === 1 ? "it" : "they"} had to and changed nothing.` : ""}
            </p>
            <blockquote className="t-small border-l-2 border-[var(--color-rule)] pl-3 text-[var(--color-ink-2)]">{ch.reason}</blockquote>
            <Act label="Run the readjudication" method="readjudicate" args={[cid]} can={a.readjudicate} caseId={cid}
              offerAppeal primary working={WORKING}>
              <p className="t-small text-[var(--color-ink-2)] measure">
                Anyone can run it, either side included. The validators judge the whole file afresh, the challenge
                evidence included, and their decision is the last word. A round that cannot see the images the first
                panel saw, or the challenger&apos;s new images, changes nothing and can be run again, three times at
                most.
              </p>
            </Act>
            <Act label="Close the challenge" method="close_challenge" args={[cid]} can={a.closeChallenge} caseId={cid}>
              <p className="t-micro text-[var(--color-ink-3)] measure">
                Closing keeps the challenged decision. The bond goes to the other side if the challenger brought
                nothing new, or only files no validator could open. It goes back to the challenger if new evidence
                was filed and no readjudication was ever recorded, or if a round could not see images the first panel
                had seen.
              </p>
            </Act>
          </div>
        </Section>
      ) : null}

      {c.state === "DETERMINED" && d ? (
        <Section title="Finalize">
          <Act label="Finalize the case" method="finalize" args={[cid]} can={a.finalize} caseId={cid}>
            <p className="t-small text-[var(--color-ink-2)] measure">
              Anyone can finalize once the challenge window has closed. The standing decision becomes final and any held
              sum moves by the rule both sides accepted: to the claimant only if the finding is{" "}
              <FindingChip value="SUPPORTED" size="sm" />, otherwise to the respondent.
            </p>
          </Act>
        </Section>
      ) : null}

      {c.decisions.length || c.state === "OPEN" ? (
        <Section title="Protocol record" aside="Studio Next's own report on each request">
          <p className="t-small text-[var(--color-ink-2)] measure">
            A transaction is accepted by the validators first, then sits in GenLayer&apos;s appeal window, then is
            finalized. A protocol appeal sends it to a larger committee; a case challenge, above, is a separate step the
            parties agreed in the terms.
          </p>
          <ProtocolRecord />
        </Section>
      ) : null}
    </div>
  );
}
