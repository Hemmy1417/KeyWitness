import Link from "next/link";

import { FindingChip } from "@/components/bits";
import { FINDING } from "@/lib/present";
import type { Finding } from "@/lib/types";

const STEPS = [
  { n: "01", title: "Agree what must be established",
    text: "The claimant writes one falsifiable claim and the criteria that would establish it. The respondent accepts that exact version by its digest, so the goalposts cannot move once evidence is in." },
  { n: "02", title: "File the evidence",
    text: "Both sides, and an independent inspector if you name one, file photographs, document pages, stills from video and text records. The contract stores the bytes and computes their digests itself." },
  { n: "03", title: "Validators assess it",
    text: "Independent GenLayer validators examine each photograph before reading anyone's description of it, judge every criterion, and must agree on which criteria are supported. Code derives the overall finding." },
  { n: "04", title: "Challenge, finalize, keep the receipt",
    text: "The side a decision went against can challenge it once, with new evidence. Then anyone can finalize, any held sum moves by the rule both sides agreed, and the receipt can be checked against the chain." },
];

const USES = [
  ["Repair completed", "Did the contractor finish the listed roof repairs before the deadline?"],
  ["Damage beyond wear", "Does the end-of-tenancy evidence show damage beyond ordinary wear?"],
  ["Condition at inspection", "Was the damp patch visible at the move-in inspection?"],
  ["Maintenance reported", "Did the tenant report the leaking boiler before the deadline?"],
];

const LIMITS = [
  "A digest proves a file was not changed after it was filed. It does not prove the file is authentic.",
  "A capture time a person declares is their claim. KeyWitness never treats it, or image metadata, as proof.",
  "Missing evidence is never treated as proof that something did not happen.",
  "A finding assesses evidence against agreed criteria. It is not a legal determination and assigns no liability.",
];

export default function Home() {
  return (
    <>
      <section className="plate">
        <div className="shell grid gap-10 py-16 md:grid-cols-[1.4fr_1fr] md:py-24">
          <div className="flex flex-col gap-6">
            <p className="t-label muted">Property evidence, assessed on GenLayer</p>
            <h1 className="t-display measure">Every property claim deserves evidence.</h1>
            <p className="t-body muted measure">
              Submit the evidence. Define what must be established. Get a traceable assessment from validators no party
              controls, with uncertainty and challenges handled explicitly.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn btn-primary" href="/cases/new">Create a case</Link>
              <Link className="btn" href="/sample">Explore the sample case</Link>
            </div>
          </div>
          <div className="hair flex flex-col gap-3 self-start p-6">
            <p className="t-label muted">The five findings</p>
            <ul className="flex flex-col gap-3">
              {(Object.keys(FINDING) as Finding[]).map((f) => (
                <li key={f} className="flex flex-col gap-1">
                  <span className="bg-[var(--color-folio)] self-start rounded"><FindingChip value={f} /></span>
                  <span className="t-small muted">{FINDING[f].meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="shell py-16">
        <h2 className="t-h1 mb-8">How a case runs</h2>
        <ol className="grid gap-px bg-[var(--color-rule)] hair md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-3 bg-[var(--color-folio)] p-6">
              <span className="t-mono text-[var(--color-ink-3)]">{s.n}</span>
              <h3 className="t-h3">{s.title}</h3>
              <p className="t-small text-[var(--color-ink-2)]">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="shell grid gap-10 pb-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 className="t-h2">What a case can ask</h2>
          <ul className="flex flex-col">
            {USES.map(([title, q]) => (
              <li key={title} className="hair-b py-3">
                <p className="t-small font-semibold">{title}</p>
                <p className="t-small text-[var(--color-ink-2)]">{q}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="t-h2">What KeyWitness will not tell you</h2>
          <ul className="flex flex-col">
            {LIMITS.map((l) => <li key={l} className="hair-b py-3 t-small text-[var(--color-ink-2)]">{l}</li>)}
          </ul>
        </div>
      </section>

      <section className="shell pt-10">
        <div className="folio grid gap-6 p-8 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex flex-col gap-2">
            <h2 className="t-h2">Why validators, not one model</h2>
            <p className="t-small text-[var(--color-ink-2)] measure">
              Reading a photograph of a ceiling or an inspection report is judgment, and no feed publishes whether a
              particular roof was repaired. A model run by one side is the party the other side does not trust. GenLayer
              gives the case a panel neither side picked, a rule for agreement anyone can read, and a record neither side
              can edit afterwards.
            </p>
          </div>
          <Link className="btn" href="/status">See the contract and network</Link>
        </div>
      </section>
    </>
  );
}
