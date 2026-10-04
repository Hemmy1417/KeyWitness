"use client";

import { Act } from "@/components/Act";
import { Section } from "@/components/bits";
import { useCase } from "@/components/case/CaseFrame";
import { Completeness, Inventory } from "@/components/case/Exhibits";
import { FilingPanel } from "@/components/case/Filing";
import { local, plural, ROLE_LABEL, until } from "@/lib/present";

export default function EvidencePage() {
  const { cid, c, t, a, now, evidence } = useCase();
  const filing = c.state === "OPEN" || c.state === "UNDER_CHALLENGE";
  // In a challenge the challenger files until its time ends; the other side and the inspector have as long again.
  const ends = c.state === "OPEN" ? c.evidence_deadline
    : !c.challenge ? "" : a.role === c.challenge.by ? c.challenge.evidence_ends : c.challenge.reply_ends;
  const closed = !!ends && now >= new Date(ends).getTime();
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-12">
        {filing && a.role ? (
          <Section title={c.state === "UNDER_CHALLENGE" ? "Add new evidence for the challenge" : "File evidence"}
            aside={!ends ? undefined : closed ? `Closed ${local(ends, t.time_zone)}`
              : `Closes ${local(ends, t.time_zone)}, ${until(ends, now)}`}>
            <FilingPanel />
          </Section>
        ) : null}
        <Section title="Evidence on this case" aside={plural(evidence.length, "exhibit")}>
          <Inventory />
        </Section>
      </div>
      <aside className="flex flex-col gap-6" aria-label="Evidence status">
        <div className="folio flex flex-col gap-3 p-5">
          <h2 className="t-label text-[var(--color-ink-3)]">Required by the terms</h2>
          <Completeness />
        </div>
        {c.state === "OPEN" ? (
          <div className="folio flex flex-col gap-3 p-5">
            <h2 className="t-label text-[var(--color-ink-3)]">Marked complete</h2>
            <ul className="flex flex-col gap-1 t-small">
              {(c.inspector ? (["CLAIMANT", "RESPONDENT", "INSPECTOR"] as const) : (["CLAIMANT", "RESPONDENT"] as const)).map((r) => (
                <li key={r}>The {ROLE_LABEL[r].toLowerCase()}: {c.ready[r] ? "complete" : "still filing"}</li>
              ))}
            </ul>
            {a.role ? (
              <Act label="Mark my evidence complete" method="mark_ready" args={[cid]} can={a.ready} caseId={cid}>
                <p className="t-micro text-[var(--color-ink-3)]">
                  When everyone has marked their evidence complete, the assessment can be asked for before the period
                  ends. Anything filed afterwards, by anyone, clears every mark.
                </p>
              </Act>
            ) : null}
          </div>
        ) : null}
        <div className="folio flex flex-col gap-2 p-5">
          <h2 className="t-label text-[var(--color-ink-3)]">What a filing proves</h2>
          <p className="t-small text-[var(--color-ink-2)]">
            The contract stores each image and text and computes its sha256 itself, so a later copy can be checked
            byte for byte. That proves the record was not altered after filing. It does not prove who made a file,
            when a photograph was taken, or that it shows this property: the validators judge what each item shows,
            and a capture time a filer declares is only their claim.
          </p>
        </div>
      </aside>
    </div>
  );
}
