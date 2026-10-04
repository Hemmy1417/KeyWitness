"use client";

/**
 * The terms in words: the claim, when it applies, each criterion, what
 * evidence counts and what the assessment will not infer. The digest that
 * binds them is in the verification fold.
 */
import { Fold, Machine } from "@/components/bits";
import {
  criterionName, EVENT_DETAIL, EVENT_LABEL, EVIDENCE_LABEL, requirementLabel, termsTime, utc, zoneName,
} from "@/lib/present";
import type { Terms } from "@/lib/types";

export function ClaimCard({ t, accepted }: { t: Terms; accepted: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="folio flex flex-col gap-3 p-6">
        <p className="t-label text-[var(--color-ink-3)]">The claim to be tested</p>
        <blockquote className="t-h3 font-normal measure">{t.claim}</blockquote>
        <p className="t-small text-[var(--color-ink-2)]">
          {EVENT_LABEL[t.event_kind]}. {EVENT_DETAIL[t.event_kind]}
        </p>
      </div>

      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[200px_1fr]">
        <dt className="t-small text-[var(--color-ink-3)]">Property</dt>
        <dd className="t-small">{t.property_ref}</dd>
        <dt className="t-small text-[var(--color-ink-3)]">Window opens</dt>
        <dd className="t-small">{t.window_start ? termsTime(t.window_start, t.time_zone, "start") : "No start stated"}</dd>
        <dt className="t-small text-[var(--color-ink-3)]">Deadline</dt>
        <dd className="t-small">{t.deadline ? termsTime(t.deadline, t.time_zone, "end") : "No deadline stated"}</dd>
        <dt className="t-small text-[var(--color-ink-3)]">Time zone</dt>
        <dd className="t-small">
          {zoneName(t.time_zone)}. Dates in the evidence are read in this zone unless the evidence says otherwise; a
          criterion that turns on an unclear date or time is insufficient.
        </dd>
      </dl>

      <div className="flex flex-col gap-3">
        <h3 className="t-h3">Criteria, each judged on its own</h3>
        <ol className="flex flex-col gap-2">
          {t.criteria.map((x) => (
            <li key={x.id} className="exhibit flex flex-col gap-1">
              <span className="t-small font-semibold">{criterionName(x.id)}</span>
              <span className="t-body">{x.text}</span>
              {x.needs_independent ? (
                <span className="t-micro text-[var(--color-ink-3)]">
                  The parties agreed this criterion needs evidence from the independent inspector.
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="t-h3">Evidence that counts</h3>
          <p className="t-small text-[var(--color-ink-2)]">
            Allowed: {t.allowed.map((k) => EVIDENCE_LABEL[k].toLowerCase()).join(", ")}.
          </p>
          {t.required.length ? (
            <ul className="t-small flex flex-col gap-1">
              {t.required.map((r) => <li key={r.type}>{requirementLabel(r.type, r.min)} is required.</li>)}
            </ul>
          ) : <p className="t-small text-[var(--color-ink-2)]">No kind of evidence is required.</p>}
          <p className="t-micro text-[var(--color-ink-3)]">
            If required evidence is missing when the assessment is asked for, no criterion can be established and the
            contract records that in code without asking any validator.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="t-h3">Limitations and excluded inferences</h3>
          {t.limitations.length ? (
            <ul className="t-small flex flex-col gap-1 list-disc pl-5">
              {t.limitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
          ) : <p className="t-small text-[var(--color-ink-2)]">The parties listed none.</p>}
          <p className="t-micro text-[var(--color-ink-3)]">
            Always excluded: missing evidence is never proof that something did not happen, and no finding decides
            legal liability.
          </p>
        </div>
      </div>

      <Fold summary={`Verify terms version ${t.version}`}>
        <p className="t-small text-[var(--color-ink-2)] pb-2">
          Published {utc(t.published_at)}.{" "}
          {accepted ? "The respondent accepted this version by its digest." : "The respondent has not accepted this version yet."}
        </p>
        <Machine label="Terms digest (sha256 of the canonical JSON)" value={t.digest} />
        <Machine label="Rules version" value={t.rules} />
      </Fold>
    </div>
  );
}
