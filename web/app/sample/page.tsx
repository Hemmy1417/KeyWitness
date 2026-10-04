"use client";

/**
 * The synthetic sample: a roof leak repair the contractor says was finished
 * in time and the property manager says was not. Every person, document and
 * picture here is invented and labelled so. This page shows the case and the
 * evidence only; the decision lives on chain, in the live run it links to,
 * and is never written into this page.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Note, Section } from "@/components/bits";
import { SAMPLE_CASE } from "@/lib/config";
import {
  caseName, criterionName, DOC_LABEL, EVIDENCE_LABEL, gen, requirementLabel, ROLE_LABEL, seconds, termsTime,
} from "@/lib/present";
import data from "@/lib/sample-data.json";
import { emptyDraft, loadDraft, saveDraft } from "@/lib/terms";
import type { EventKind, EvidenceKind, Role } from "@/lib/types";

const ISOLATES = [
  "Attendance. An invoice or a statement can show a visit; it cannot show that the work was finished.",
  "Each task on its own: the slates, the flashing on every face, and the gutter. A task left out fails this criterion.",
  "Completeness. One unfinished task is enough to stop this criterion being supported.",
  "The point of the repair. New slates on a roof are not evidence of a dry ceiling.",
  "Timing. A date printed on a picture is the camera's setting; the deadline needs evidence of when the work was finished.",
];

const PARTY: Record<Role, string> = {
  CLAIMANT: "the contractor (claimant)", RESPONDENT: "the property manager (respondent)", INSPECTOR: "the inspector",
};

export default function SamplePage() {
  const router = useRouter();
  const t = data.terms;
  const [replacing, setReplacing] = useState(false);

  const startFromSample = () => {
    // A draft the person was writing is theirs: it is replaced only when they say so.
    if (!replacing && loadDraft()) {
      setReplacing(true);
      return;
    }
    const d = emptyDraft();
    saveDraft({
      ...d, title: "My copy of the roof leak sample", eventKind: t.event_kind as EventKind, propertyRef: t.property_ref,
      timeZone: t.time_zone, windowStart: t.window_start, deadline: t.deadline, claim: t.claim,
      criteria: t.criteria.map((c) => ({ text: c.text, needsIndependent: c.needs_independent })),
      allowed: t.allowed as EvidenceKind[], required: t.required, limitations: t.limitations,
      heldSum: "0", challengeBond: "0.05", evidenceSeconds: 600, challengeSeconds: 3600, challengeEvidenceSeconds: 600,
    });
    router.push("/cases/new");
  };

  return (
    <>
      <section className="plate">
        <div className="shell flex flex-col gap-5 py-14">
          <span className="self-start rounded-sm bg-[var(--color-uncertain-bright)] px-3 py-1.5 t-small font-bold text-[var(--color-navy)]">
            SYNTHETIC DEMO DATA
          </span>
          <h1 className="t-display measure">A roof leak, a deadline and two accounts of the same repair</h1>
          <p className="t-body muted measure">
            Everything on this page is invented: the people, the property, the documents and the pictures, which are
            drawn illustrations rather than photographs. It shows how a case is set up so that the criteria keep apart the
            things that are easy to blur.
          </p>
        </div>
      </section>

      <div className="shell flex flex-col gap-14 py-12">
        <Section title="The story">
          <div className="grid gap-6 md:grid-cols-3">
            <p className="t-small text-[var(--color-ink-2)]">
              <span className="font-semibold text-[var(--color-ink)]">The order.</span> A letting agent orders a roofer to
              replace slipped slates above a bathroom, reseal the chimney flashing on every face and clear the gutter, by
              17:00 on 26 September 2026.
            </p>
            <p className="t-small text-[var(--color-ink-2)]">
              <span className="font-semibold text-[var(--color-ink)]">The contractor</span> says it was all done on 25
              September and files photographs, an invoice and a statement. The invoice lists the flashing on the south face
              only.
            </p>
            <p className="t-small text-[var(--color-ink-2)]">
              <span className="font-semibold text-[var(--color-ink)]">The property manager</span> inspects on 27 September,
              finds the ceiling still wet and the north flashing untouched, and files the work order, the report and a
              photograph of the stain.
            </p>
          </div>
        </Section>

        <Section title="What each criterion keeps apart">
          <ol className="flex flex-col gap-3">
            {t.criteria.map((c, i) => (
              <li key={i} className="exhibit flex flex-col gap-1">
                <span className="t-small font-semibold">{criterionName(`C${i + 1}`)}</span>
                <span className="t-body">{c.text}</span>
                <span className="t-micro text-[var(--color-ink-3)]">{ISOLATES[i]}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="The terms both sides accept">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[220px_1fr] t-small">
            <dt className="text-[var(--color-ink-3)]">Claim</dt><dd>{t.claim}</dd>
            <dt className="text-[var(--color-ink-3)]">Window</dt>
            <dd>From {termsTime(t.window_start, t.time_zone, "start")} to {termsTime(t.deadline, t.time_zone, "end")}</dd>
            <dt className="text-[var(--color-ink-3)]">Required evidence</dt>
            <dd>{t.required.map((r) => requirementLabel(r.type, r.min)).join("; ")}</dd>
            <dt className="text-[var(--color-ink-3)]">Held sum</dt>
            <dd>{gen(t.held_sum_wei)} of test GEN, deposited by the property manager: to the contractor only if the final finding is supported</dd>
            <dt className="text-[var(--color-ink-3)]">Challenge bond</dt><dd>{gen(t.challenge_bond_wei)}</dd>
            <dt className="text-[var(--color-ink-3)]">Windows</dt>
            <dd>{seconds(t.evidence_period_seconds)} for evidence and for each challenge step, short enough to watch the whole case run</dd>
            <dt className="text-[var(--color-ink-3)]">Excluded inferences</dt><dd>{t.limitations.join(" ")}</dd>
          </dl>
        </Section>

        <Section title="The evidence" aside={`${data.evidence.length} items, all invented`}>
          <div className="grid gap-4 md:grid-cols-2">
            {data.evidence.map((e) => {
              const kind = e.kind as EvidenceKind;
              const docType = "doc_type" in e ? (e as { doc_type: string }).doc_type : "";
              const text = kind === "TEXT_DOCUMENT" ? (data.documents as Record<string, string>)[e.file] ?? "" : "";
              return (
                <article key={e.file} className="exhibit flex flex-col gap-2">
                  <p className="t-small font-semibold">
                    {EVIDENCE_LABEL[kind]}{docType ? `: ${(DOC_LABEL[docType] ?? docType).toLowerCase()}` : ""}
                  </p>
                  <p className="t-micro text-[var(--color-ink-3)]">Filed by {PARTY[e.role as Role] ?? ROLE_LABEL[e.role as Role]}</p>
                  {kind !== "TEXT_DOCUMENT" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a fixed, labelled illustration
                    <img src={`/sample/${e.file}`} alt={`Synthetic illustration: ${e.description}`} loading="lazy"
                      className="w-full border border-[var(--color-rule)] bg-white" />
                  ) : (
                    <pre className="inset whitespace-pre-wrap break-words p-3 t-small font-[inherit]">{text}</pre>
                  )}
                  <p className="t-small"><span className="font-semibold">The filer says:</span> {e.description}</p>
                  <p className="t-micro text-[var(--color-ink-3)]">Declared date: {e.declared_capture}. A claim, not proof.</p>
                </article>
              );
            })}
          </div>
        </Section>

        <Section title="The live run">
          {SAMPLE_CASE ? (
            <div className="flex flex-col gap-3">
              <p className="t-body measure">
                This exact case was run on Studio Next with the evidence above. Its findings are whatever the validators
                recorded; this page never shows a result of its own.
              </p>
              <Link className="btn btn-primary self-start" href={`/cases/${SAMPLE_CASE}`}>See {caseName(SAMPLE_CASE)} on Studio Next</Link>
            </div>
          ) : (
            <Note title="Not run on this deployment yet.">
              <p>Once the sample is run on Studio Next, the live case is linked here. Until then, no result is shown anywhere for it.</p>
            </Note>
          )}
          <div className="flex flex-col gap-2">
            <button type="button" className="btn self-start" onClick={startFromSample}>
              {replacing ? "Replace my saved draft with these terms" : "Start a case from these terms"}
            </button>
            {replacing ? (
              <p className="t-small" role="alert">
                You have a case draft saved in this browser. Starting from the sample replaces it.{" "}
                <button type="button" className="link" onClick={() => setReplacing(false)}>Keep my draft</button>
              </p>
            ) : null}
            <p className="t-micro text-[var(--color-ink-3)]">Fills the new-case form with these criteria. You name the respondent and file your own evidence.</p>
          </div>
        </Section>
      </div>
    </>
  );
}
