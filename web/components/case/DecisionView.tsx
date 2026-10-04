"use client";

/**
 * One recorded decision, read as a person would read it: the overall
 * finding and the rule that derived it, each criterion with what it rests
 * on and what weighs against it, why a floor changed what the panel first
 * said, and what the examination saw. What was bound by consensus is kept
 * apart from what only the leading validator wrote.
 */
import { FindingChip, Fold, Icon, Machine, Note } from "@/components/bits";
import {
  criterionName, CUT_NOTE, cutShort, decisionName, EVIDENCE_LABEL, exhibitName, FINDING, floorText, listLabels, local,
  OVERALL_MEANING, prose, ROLE_LABEL, settleText, utc,
} from "@/lib/present";
import type { Decision, Evidence, Finding } from "@/lib/types";

const KIND_TEXT: Record<Decision["kind"], string> = {
  ASSESSMENT: "Assessment by GenLayer validators",
  READJUDICATION: "Readjudication by GenLayer validators after a challenge",
  CODE: "Decided in code: required evidence was missing, so no validator was asked",
};

const STATUS_TEXT: Record<Decision["status"], string> = {
  STANDING: "Standing: this is the decision the case rests on now.",
  SUPERSEDED: "Superseded by a later decision. It stays on the record exactly as it was.",
  FINAL: "Final: the case was finalized on this decision.",
  NO_RESULT: "No result: this round could not examine everything it had to (the images the first panel saw and the challenger's new images), so it changed nothing and the decision it was checking kept standing.",
};

function ItemList({ ids, evidence }: { ids: string[]; evidence: Evidence[] }) {
  if (!ids.length) return <span className="text-[var(--color-ink-3)]">none</span>;
  return (
    <>
      {ids.map((id, i) => {
        const e = evidence.find((x) => x.evidence_id === id);
        return (
          <span key={id}>
            {i ? ", " : ""}
            <span className="font-semibold">{exhibitName(id)}</span>
            {e ? ` (${EVIDENCE_LABEL[e.kind].toLowerCase()}, ${ROLE_LABEL[e.role].toLowerCase()})` : ""}
          </span>
        );
      })}
    </>
  );
}

const RULE = "All criteria supported gives supported. Otherwise any not established gives not established, then any conflicting gives conflicting, otherwise insufficient. Any criterion not assessed makes the whole decision not assessed.";

export function DecisionView({ d, evidence, zone }: { d: Decision; evidence: Evidence[]; zone: string }) {
  const code = d.kind === "CODE";
  // What the combined floor F6/F7 stood for in this decision, read from the decision itself.
  const flagged = d.instructions_found.length > 0;
  const reused = d.evidence.some((e) => e.reuse === "SELF" && e.role === "CLAIMANT");
  const seen = new Set(d.seen_ids);
  return (
    <div className="flex flex-col gap-8">
      <div className="folio flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="t-label text-[var(--color-ink-3)]">
            {decisionName(d.decision_id)} &middot; {d.kind === "READJUDICATION" || d.round === 2 ? "second round" : "first round"}
          </p>
          <span className="t-small text-[var(--color-ink-3)]">{local(d.decided_at, zone)} ({utc(d.decided_at)})</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="t-h2">Overall</span>
          <FindingChip value={d.overall} />
        </div>
        <p className="t-body measure">{OVERALL_MEANING[d.overall]}</p>
        {!code && d.overall !== "NOT_ASSESSED" ? (
          <p className="t-small text-[var(--color-ink-2)] measure">
            {d.overall === "SUPPORTED" ? "The validators agreed, by majority, that every criterion is supported."
              : `The validators agreed, by majority, that the claim is not supported. That it reads "${FINDING[d.overall].label.toLowerCase()}" rather than another of the labels short of supported is the leading validator's reading, derived in code from its criterion labels.`}
          </p>
        ) : null}
        <p className="t-small text-[var(--color-ink-2)]">{KIND_TEXT[d.kind]}. {STATUS_TEXT[d.status]}</p>
        <p className="t-micro text-[var(--color-ink-3)] measure">
          The overall finding is derived in code from the criteria, never by a model: {RULE}
        </p>
        {d.scope ? (
          <p className="t-small text-[var(--color-ink-2)] measure">
            <span className="font-semibold">What this decision is. </span>{d.scope}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="t-h3">Criterion by criterion</h3>
        {d.criteria.map((x) => {
          const changed = !!x.model_finding && x.model_finding !== x.finding;
          return (
            <section key={x.id} className="exhibit flex flex-col gap-3" aria-label={criterionName(x.id)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="t-small font-semibold">{criterionName(x.id)}</span>
                  <span className="t-body measure">{x.text}</span>
                </div>
                <span className="flex flex-col items-end gap-1">
                  <FindingChip value={x.finding as Finding} />
                  {!code ? (
                    <span className="t-micro text-[var(--color-ink-3)] text-right max-w-[260px]">
                      {x.finding === "SUPPORTED" ? "The validators agreed, by majority, that it is supported."
                        : "The validators agreed, by majority, that it is not supported; this label is the leading validator's reading."}
                    </span>
                  ) : null}
                </span>
              </div>
              {changed ? (
                <Note title={`The panel said ${FINDING[x.model_finding as Finding]?.label.toLowerCase() ?? "something else"}; the floors made it ${FINDING[x.finding].label.toLowerCase()}.`}>
                  <ul className="flex flex-col gap-1">
                    {x.floors.map((f) => <li key={f}>{floorText(f, flagged, reused)}</li>)}
                  </ul>
                </Note>
              ) : x.floors.length ? (
                <ul className="t-micro text-[var(--color-ink-3)] flex flex-col gap-0.5">
                  {x.floors.map((f) => <li key={f}>{floorText(f, flagged, reused)}</li>)}
                </ul>
              ) : null}
              <dl className="flex flex-col gap-1.5 t-small">
                <div><dt className="inline font-semibold">{listLabels(x.finding)[0]}: </dt><dd className="inline"><ItemList ids={x.basis} evidence={evidence} /></dd></div>
                <div><dt className="inline font-semibold">{listLabels(x.finding)[1]}: </dt><dd className="inline"><ItemList ids={x.contrary} evidence={evidence} /></dd></div>
                {x.missing.length ? (
                  <div><dt className="inline font-semibold">What would settle it: </dt><dd className="inline">{x.missing.map(settleText).join("; ")}</dd></div>
                ) : null}
              </dl>
              {x.rationale ? (
                <div className="inset flex flex-col gap-1 p-4">
                  <p className="t-micro text-[var(--color-ink-3)]">
                    {code ? "Recorded by the contract" : "Reasoning written by the leading validator. The other validators had to reach the same finding, not the same words."}
                  </p>
                  <p className="t-small">{prose(x.rationale)}</p>
                  {cutShort(x.rationale) ? <p className="t-micro text-[var(--color-ink-3)]">{CUT_NOTE}</p> : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {d.unseen_ids.length ? (
        <Note tone="warn" title="Not every image reached the validators">
          <p>{d.unseen_ids.map(exhibitName).join(", ")} could not be examined, so {d.unseen_ids.length === 1 ? "it counts" : "they count"} for nothing in this decision.</p>
        </Note>
      ) : null}
      {d.instructions_found.length ? (
        <Note tone="warn" title="Text addressed to the assessor">
          <p>
            The leading validator flagged {d.instructions_found.map(exhibitName).join(", ")} for text that tried to
            instruct the assessor. A flagged item cannot count for the side that filed it, and each agreeing validator
            checked that no flag it did not hold itself changed what this record binds.
          </p>
        </Note>
      ) : null}

      {!code && d.observations.length ? (
        <Fold summary="What the examination saw in each image">
          <p className="t-small text-[var(--color-ink-2)] pb-3">
            The leading validator&apos;s notes, written before it read anyone&apos;s description of the images.
          </p>
          <ul className="flex flex-col gap-3">
            {d.observations.map((o) => (
              <li key={o.evidence_id} className="t-small flex flex-col gap-0.5">
                <span className="font-semibold">{exhibitName(o.evidence_id)}{seen.has(o.evidence_id) ? "" : ": not seen"}</span>
                {o.shows ? <span>{o.shows}</span> : null}
                {o.text?.length ? <span className="t-micro text-[var(--color-ink-2)]">Text read off the image: {o.text.join(" / ")}</span> : null}
                {o.text_cut ? <span className="t-micro text-[var(--color-ink-3)]">The transcript was longer than the record holds; this is part of it.</span> : null}
                {o.dates?.length ? <span className="t-micro text-[var(--color-ink-2)]">Dates visible in it: {o.dates.join(", ")}</span> : null}
                {o.subject_doubts ? <span className="t-micro text-[var(--color-ink-2)]">Doubt it noted about the subject: {o.subject_doubts}</span> : null}
                {o.quality ? <span className="t-micro text-[var(--color-ink-3)]">Image quality: {o.quality.toLowerCase()}</span> : null}
              </li>
            ))}
          </ul>
        </Fold>
      ) : null}

      {d.limitations.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="t-h3">What this assessment could not check</h3>
          <ul className="t-small list-disc pl-5 flex flex-col gap-1">{d.limitations.map((l) => <li key={l}>{prose(l)}</li>)}</ul>
        </div>
      ) : null}

      <div className="flex items-start gap-2 t-small text-[var(--color-ink-2)]">
        <span aria-hidden="true"><Icon name="lock" /></span>
        <span>
          {code ? "Bound by code: the findings follow from the missing evidence alone."
            : "Bound by consensus: a majority of validators, each running the assessment itself, reproduced for each criterion whether it is supported, and so whether the claim is. The finer label of a criterion that is not supported, the reasoning, the cited items, the flags, the notes and the limitations are the leading validator's."}
          {d.calibrated ? " Before examining the photographs, the leading validator's model had to read a calibration image the contract draws; a model that receives no image, or invents what it shows, cannot lead. Validators whose models cannot receive images judged from the leading validator's descriptions; validators that can receive them examined every photograph themselves." : ""}
        </span>
      </div>

      <Fold summary={`Verify ${decisionName(d.decision_id)}`}>
        <Machine label="Decision id" value={d.decision_id} />
        <Machine label="Decision digest (everything but its lifecycle fields)" value={d.decision_digest} />
        <Machine label="Evidence manifest digest (the snapshot this decision judged)" value={d.manifest_digest} />
        <Machine label={`Terms version ${d.terms_version} digest`} value={d.terms_digest} />
        <Machine label="Requested by" value={d.requested_by} />
        <div className="flex flex-col gap-1 pt-2">
          <span className="t-micro text-[var(--color-ink-3)]">The evidence snapshot, item by item</span>
          {d.evidence.map((e) => (
            <span key={e.evidence_id} className="t-mono break-all">{e.evidence_id} {e.role.toLowerCase()} {e.sha256}</span>
          ))}
        </div>
      </Fold>
    </div>
  );
}
