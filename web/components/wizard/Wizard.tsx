"use client";

/**
 * Opening a case, in five steps: the case, the claim and its time, the
 * criteria and the evidence that counts, the parties and the money, then a
 * review. Each step checks the contract's own limits before anything is
 * signed; the contract checks everything again. The draft lives in this
 * browser until the case is opened. With ?revise=<case>, the same steps
 * publish a new version of terms the respondent has not accepted yet.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Act } from "@/components/Act";
import type { FlowResult } from "@/components/TxFlow";
import { Field, Fold, Icon, Loading, Note, ReadFailure } from "@/components/bits";
import { acts } from "@/lib/acts";
import { CONTRACT_CONFIGURED } from "@/lib/config";
import { privacyWarnings } from "@/lib/images";
import {
  caseIdFrom, caseName, criterionName, DOC_LABEL, EVENT_DETAIL, EVENT_LABEL, EVIDENCE_LABEL, gen, parseGen,
  requirementLabel, seconds, termsTime, zoneName,
} from "@/lib/present";
import { getCase, getTerms } from "@/lib/read";
import {
  buildTerms, check, clearDraft, draftFromTerms, emptyDraft, LIMITS, loadDraft, saveDraft, STARTERS, STEPS, validZone,
  WINDOW_PRESETS, ZONES, type Draft,
} from "@/lib/terms";
import { CLOSED, type Case, type EventKind, type EvidenceKind, type Terms } from "@/lib/types";
import { useChain } from "@/lib/useChain";
import { useNow } from "@/lib/useNow";
import { useWallet } from "@/lib/wallet";

const KINDS: EvidenceKind[] = ["PHOTO", "VIDEO_FRAME", "DOCUMENT_PAGE", "TEXT_DOCUMENT"];
const REQUIREMENTS = [...KINDS, ...Object.keys(DOC_LABEL).map((k) => `DOC:${k}`)];

const CLAIM_EXAMPLE: Record<EventKind, string> = {
  REPAIR_COMPLETED: "The roof leak repairs listed in work order 14 were completed before the maintenance deadline.",
  CONDITION_AT_INSPECTION: "The damp patch on the bedroom ceiling was visible at the move-in inspection.",
  DAMAGE_BEYOND_WEAR: "The kitchen worktop was damaged beyond ordinary wear and tear during the tenancy.",
  MAINTENANCE_REPORTED: "The tenant reported the leaking boiler to the managing agent before the deadline.",
};

const subscribe = () => () => undefined;

/** Splits "2026-10-03T17:00" into a date and a time for two inputs, and back. */
function DateTime({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  const [dayPart = "", timePart = ""] = value.split("T");
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="t-small font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <input type="date" className="field max-w-[200px]" value={dayPart} aria-label={`${label}: date`}
          onChange={(e) => onChange(e.target.value ? (timePart ? `${e.target.value}T${timePart}` : e.target.value) : "")} />
        <input type="time" className="field max-w-[150px]" value={timePart} aria-label={`${label}: time (optional)`}
          disabled={!dayPart} onChange={(e) => onChange(e.target.value ? `${dayPart}T${e.target.value}` : dayPart)} />
        {value ? <button type="button" className="btn btn-quiet" onClick={() => onChange("")}>Clear</button> : null}
      </div>
      <span className="t-micro text-[var(--color-ink-3)]">{hint}</span>
    </fieldset>
  );
}

function WindowSelect({ label, value, min = LIMITS.minWindow, max, onChange, hint }: {
  label: string; value: number; min?: number; max: number; onChange: (n: number) => void; hint: string;
}) {
  const options = WINDOW_PRESETS.filter((p) => p.seconds >= min && p.seconds <= max);
  return (
    <Field label={label} hint={hint}>
      <select className="field" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((p) => <option key={p.seconds} value={p.seconds}>{p.label}</option>)}
        {!options.some((p) => p.seconds === value) ? <option value={value}>{seconds(value)}</option> : null}
      </select>
    </Field>
  );
}

function Problems({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="folio p-4" role="alert" style={{ borderLeft: "4px solid var(--color-adverse)" }}>
      <p className="t-small font-semibold">Before you continue</p>
      <ul className="t-small list-disc pl-5">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

function Form({ initial, revise, revising, restoredAt = 0 }: {
  initial: Draft; revise: string; revising: { c: Case; t: Terms } | null; restoredAt?: number;
}) {
  const w = useWallet();
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState<boolean[]>([false, false, false, false, false]);
  const [opened, setOpened] = useState<{ cid: string; waiting: boolean } | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const now = useNow();

  const set = (patch: Partial<Draft>) => {
    setD((prev) => {
      const next = { ...prev, ...patch };
      if (!revise) saveDraft(next);
      return next;
    });
  };

  // A follow-up continues a closed case between the same two parties; the contract refuses anything else.
  const followsId = revise ? "" : caseIdFrom(d.followsCase);
  const earlier = useChain(followsId ? `case.${followsId}` : null, (fresh) => getCase(followsId, fresh));
  const followState: string[] = [];
  const followParties: string[] = [];
  if (followsId && earlier.data === null) followState.push(`There is no ${caseName(followsId)} on this deployment to follow.`);
  if (followsId && earlier.data) {
    if (!CLOSED.includes(earlier.data.state)) followState.push(`${caseName(followsId)} is still running; a follow-up continues a closed case.`);
    const pair = (a: string, b: string) => [a, b].map((x) => x.trim().toLowerCase()).sort().join("|");
    if (w.address && d.respondent && pair(earlier.data.claimant, earlier.data.respondent) !== pair(w.address, d.respondent)) {
      followParties.push(`A follow-up is between the same two parties as ${caseName(followsId)}.`);
    }
  }
  const extra = (i: number) => (i === 0 ? followState : i === 3 ? followParties : []);
  const problems = [...check(step, d, w.address), ...extra(step)];
  const go = (to: number) => {
    if (to > step) {
      setTried((t) => t.map((x, i) => (i === step ? true : x)));
      if (problems.length) return;
    }
    setStep(to);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // After the case is recorded, wait until it can be read before showing it.
  useEffect(() => {
    if (!opened?.waiting) return;
    let alive = true;
    const started = Date.now();
    const poll = async () => {
      while (alive && Date.now() - started < 60_000) {
        try {
          if (await getCase(opened.cid, true)) {
            router.push(`/cases/${opened.cid}`);
            return;
          }
        } catch {
          /* keep waiting */
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      if (alive) setOpened((o) => (o ? { ...o, waiting: false } : o));
    };
    void poll();
    return () => { alive = false; };
  }, [opened, router]);

  const terms = useMemo(() => buildTerms(d), [d]);
  const allProblems = STEPS.flatMap((_, i) => [...check(i, d, w.address), ...extra(i)]);
  const held = parseGen(d.heldSum || "0") ?? 0n;

  const reviseCan = revising ? acts({ c: revising.c, t: revising.t, d: null, evidence: [], addr: w.address, now }).revise : null;
  const can = allProblems.length ? { ok: false, why: "Fix the steps marked above first." }
    : reviseCan && !reviseCan.ok ? reviseCan : { ok: true, why: "" };

  const onDone = (r: FlowResult) => {
    const cid = r.returned?.case_id;
    if (r.outcome !== "recorded" || typeof cid !== "string") return;
    if (!revise) clearDraft();
    setOpened({ cid, waiting: true });
  };

  const changeKind = (kind: EventKind) => {
    const untouched = JSON.stringify(d.criteria) === JSON.stringify(STARTERS[d.eventKind]);
    set({ eventKind: kind, ...(untouched ? { criteria: STARTERS[kind].map((c) => ({ ...c })) } : {}) });
  };

  const warn = privacyWarnings([d.title, d.propertyRef, d.claim, ...d.criteria.map((c) => c.text), ...d.limitations].join(" \n "));

  return (
    <div ref={top} className="shell grid gap-10 py-12 lg:grid-cols-[240px_minmax(0,1fr)] scroll-mt-6">
      <aside className="flex flex-col gap-4">
        <h1 className="t-h2">{revise ? `Revise ${caseName(revise)}` : "Open a case"}</h1>
        <ol className="rail flex flex-col gap-3" aria-label="Steps">
          {STEPS.map((s, i) => {
            const bad = tried[i] && [...check(i, d, w.address), ...extra(i)].length > 0;
            return (
              <li key={s} className="rail-node" data-state={i === step ? "now" : bad ? "bad" : i < step ? "done" : undefined}>
                <button type="button" className={`t-small text-left ${i === step ? "font-semibold" : ""}`} aria-current={i === step ? "step" : undefined}
                  onClick={() => go(i)}>{i + 1}. {s}</button>
              </li>
            );
          })}
        </ol>
        {!revise ? (
          <p className="t-micro text-[var(--color-ink-3)]">
            Your draft is kept in this browser only until you open the case.{" "}
            <button type="button" className="link" onClick={() => { clearDraft(); setD(emptyDraft()); setStep(0); setTried([false, false, false, false, false]); }}>
              Start over
            </button>
          </p>
        ) : (
          <p className="t-micro text-[var(--color-ink-3)]">
            A revision publishes version {(revising?.t.version ?? 0) + 1}. The respondent, the inspector and the case it
            follows stay as they are.
          </p>
        )}
      </aside>

      <div className="flex min-w-0 flex-col gap-8">
        {restoredAt && step === 0 ? (
          <Note title="Your draft is back.">
            <p>This browser kept the case you started{restoredAt ? ` at ${new Date(restoredAt).toTimeString().slice(0, 5)}` : ""}. Carry on, or start over from the steps list.</p>
          </Note>
        ) : null}
        {step === 0 ? (
          <section className="flex flex-col gap-6" aria-label={STEPS[0]}>
            <fieldset className="flex flex-col gap-2">
              <legend className="t-small font-semibold">What kind of case is it?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(EVENT_LABEL) as EventKind[]).map((k) => (
                  <label key={k} className={`folio flex cursor-pointer gap-3 p-4 ${d.eventKind === k ? "outline outline-2 outline-[var(--color-ink)]" : ""}`}>
                    <input type="radio" name="kind" className="mt-1" checked={d.eventKind === k} onChange={() => changeKind(k)} />
                    <span className="flex flex-col gap-1">
                      <span className="t-small font-semibold">{EVENT_LABEL[k]}</span>
                      <span className="t-micro text-[var(--color-ink-2)]">{EVENT_DETAIL[k]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Case title" hint={`5 to ${LIMITS.title} characters. Public.`}>
              <input className="field" maxLength={LIMITS.title} value={d.title} onChange={(e) => set({ title: e.target.value })}
                placeholder="Roof leak repair before the maintenance deadline" />
            </Field>
            <Field label="Property, by nickname" hint="A nickname only, such as Riverside flat. Never a street address, a name or contact details: everything is public.">
              <input className="field" maxLength={LIMITS.property} value={d.propertyRef} onChange={(e) => set({ propertyRef: e.target.value })} />
            </Field>
            <Field label="Does this follow an earlier case? (optional)" hint="The number of a closed case between the same two parties. Changing criteria after a decision means a follow-up case; the earlier case stays as it is.">
              <input className="field max-w-[200px]" inputMode="numeric" value={d.followsCase} disabled={!!revise}
                onChange={(e) => set({ followsCase: e.target.value })} placeholder="For example 3" />
            </Field>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="flex flex-col gap-6" aria-label={STEPS[1]}>
            <Field label="The claim" hint={`One falsifiable statement, 10 to ${LIMITS.claim} characters. The validators test exactly this.`}>
              <textarea className="field" maxLength={LIMITS.claim} value={d.claim} onChange={(e) => set({ claim: e.target.value })}
                placeholder={CLAIM_EXAMPLE[d.eventKind]} />
            </Field>
            <Note title="Keep it bounded">
              <p>Ask whether the evidence establishes something specific, never who is telling the truth. For example: {CLAIM_EXAMPLE[d.eventKind]}</p>
            </Note>
            <Field label="Time zone the dates are in" hint="Dates in the evidence are read in this zone unless the evidence says otherwise.">
              <select className="field max-w-[320px]" value={ZONES.includes(d.timeZone) ? d.timeZone : "other"}
                onChange={(e) => set({ timeZone: e.target.value === "other" ? "" : e.target.value })}>
                {ZONES.map((z) => <option key={z} value={z}>{zoneName(z)}</option>)}
                <option value="other">Another zone...</option>
              </select>
            </Field>
            {!ZONES.includes(d.timeZone) ? (
              <Field label="Zone name" hint="An IANA name such as Europe/Paris." error={d.timeZone && !validZone(d.timeZone) ? "This browser does not know that zone." : undefined}>
                <input className="field max-w-[320px]" value={d.timeZone} onChange={(e) => set({ timeZone: e.target.value.trim() })} />
              </Field>
            ) : null}
            <DateTime label="When the window opens (optional)" value={d.windowStart} onChange={(v) => set({ windowStart: v })}
              hint="For example the date the repair was ordered." />
            <DateTime label="Deadline (optional)" value={d.deadline} onChange={(v) => set({ deadline: v })}
              hint="Add a time if the hour matters. A criterion that turns on a date the evidence leaves unclear is insufficient." />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="flex flex-col gap-6" aria-label={STEPS[2]}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="t-h3">Criteria</h2>
                <button type="button" className="btn btn-quiet" onClick={() => set({ criteria: STARTERS[d.eventKind].map((c) => ({ ...c })) })}>
                  Use the suggested criteria for this kind of case
                </button>
              </div>
              <p className="t-small text-[var(--color-ink-2)] measure">
                Each criterion is judged on its own. Keep apart what is easy to blur: that someone visited, that each task was
                done, that all of it was done, that the condition improved, and that it happened in time.
              </p>
              {d.criteria.map((c, i) => (
                <div key={i} className="exhibit flex flex-col gap-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="t-small font-semibold">{criterionName(`C${i + 1}`)}</span>
                    <textarea className="field !min-h-[80px]" maxLength={LIMITS.criterion} value={c.text}
                      onChange={(e) => set({ criteria: d.criteria.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 t-small">
                      <input type="checkbox" checked={c.needsIndependent}
                        onChange={(e) => set({ criteria: d.criteria.map((x, j) => (j === i ? { ...x, needsIndependent: e.target.checked } : x)) })} />
                      Needs evidence from an independent inspector
                    </label>
                    {d.criteria.length > 1 ? (
                      <button type="button" className="btn btn-quiet" onClick={() => set({ criteria: d.criteria.filter((_, j) => j !== i) })}>Remove</button>
                    ) : null}
                  </div>
                </div>
              ))}
              {d.criteria.length < LIMITS.criteria ? (
                <button type="button" className="btn self-start" onClick={() => set({ criteria: [...d.criteria, { text: "", needsIndependent: false }] })}>
                  Add a criterion
                </button>
              ) : null}
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="t-small font-semibold">Evidence the parties may file</legend>
              {KINDS.map((k) => (
                <label key={k} className="flex items-center gap-2 t-small">
                  <input type="checkbox" checked={d.allowed.includes(k)}
                    onChange={(e) => set({ allowed: e.target.checked ? KINDS.filter((x) => x === k || d.allowed.includes(x)) : d.allowed.filter((x) => x !== k) })} />
                  {EVIDENCE_LABEL[k]}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-2">
              <h2 className="t-small font-semibold">Required evidence</h2>
              <p className="t-micro text-[var(--color-ink-3)]">If any of it is missing when the assessment is asked for, nothing can be established.</p>
              {d.required.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className="field max-w-[300px]" aria-label="Kind of evidence" value={r.type}
                    onChange={(e) => set({ required: d.required.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })}>
                    {REQUIREMENTS.map((t) => <option key={t} value={t}>{t.startsWith("DOC:") ? `Document: ${DOC_LABEL[t.slice(4)]}` : EVIDENCE_LABEL[t as EvidenceKind]}</option>)}
                  </select>
                  <select className="field max-w-[120px]" aria-label="At least" value={r.min}
                    onChange={(e) => set({ required: d.required.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>At least {n}</option>)}
                  </select>
                  <button type="button" className="btn btn-quiet" onClick={() => set({ required: d.required.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              ))}
              {d.required.length < LIMITS.required ? (
                <button type="button" className="btn self-start" onClick={() => set({ required: [...d.required, { type: "PHOTO", min: 1 }] })}>Add a requirement</button>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="t-small font-semibold">Known limitations and excluded inferences (optional)</h2>
              <p className="t-micro text-[var(--color-ink-3)]">What the assessment must not conclude, for example: it does not test the roof under rain.</p>
              {d.limitations.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="field" maxLength={LIMITS.line} value={l} aria-label={`Limitation ${i + 1}`}
                    onChange={(e) => set({ limitations: d.limitations.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <button type="button" className="btn btn-quiet" onClick={() => set({ limitations: d.limitations.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              ))}
              {d.limitations.length < LIMITS.limitations ? (
                <button type="button" className="btn self-start" onClick={() => set({ limitations: [...d.limitations, ""] })}>Add a limitation</button>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="flex flex-col gap-6" aria-label={STEPS[3]}>
            <Field label="Respondent's wallet address" hint="The other party. They accept these exact terms, or decline them.">
              <input className="field t-mono" value={d.respondent} disabled={!!revise} spellCheck={false}
                onChange={(e) => set({ respondent: e.target.value.trim() })} placeholder="0x..." />
            </Field>
            <Field label="Independent inspector's wallet address (optional)" hint="Someone independent of both parties, who must accept the role before evidence opens. Needed if a criterion requires independent evidence.">
              <input className="field t-mono" value={d.inspector} disabled={!!revise} spellCheck={false}
                onChange={(e) => set({ inspector: e.target.value.trim() })} placeholder="0x..." />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Held sum in GEN (0 for a record only)" hint="Deposited before evidence opens. It goes to the claimant only if the final finding is supported; otherwise to the respondent.">
                <input className="field" inputMode="decimal" value={d.heldSum} onChange={(e) => set({ heldSum: e.target.value })} />
              </Field>
              {held > 0n ? (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="t-small font-semibold">Who deposits it</legend>
                  {(["RESPONDENT", "CLAIMANT"] as const).map((p) => (
                    <label key={p} className="flex items-center gap-2 t-small">
                      <input type="radio" name="funder" checked={d.funder === p} onChange={() => set({ funder: p })} />
                      The {p.toLowerCase()}
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <Field label="Challenge bond in GEN" hint="Posted by whoever challenges a decision. Between 0.01 and 100.">
                <input className="field" inputMode="decimal" value={d.challengeBond} onChange={(e) => set({ challengeBond: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <WindowSelect label="Evidence period" value={d.evidenceSeconds} max={LIMITS.maxEvidence}
                onChange={(n) => set({ evidenceSeconds: n })} hint="From the moment the case opens." />
              <WindowSelect label="Challenge window" value={d.challengeSeconds} min={LIMITS.minChallengeWindow}
                max={LIMITS.maxChallenge} onChange={(n) => set({ challengeSeconds: n })}
                hint="After each decision. At least an hour: a decision is dated by the request for it, and the validators can take many minutes to agree." />
              <WindowSelect label="New evidence in a challenge" value={d.challengeEvidenceSeconds} max={LIMITS.maxChallenge}
                onChange={(n) => set({ challengeEvidenceSeconds: n })}
                hint="For the challenger, after a challenge opens. The other side then has as long again to answer." />
            </div>
            <Note tone="privacy" title="What becomes public">
              <p>
                The title, the property nickname, the claim, the criteria, both wallet addresses and everything either side
                files are public and permanent on Studio Next. Use a nickname, never an address, and leave names, phone
                numbers and access codes out. Receipts can later be shared in a public form that leaves out the addresses
                and the property nickname.
              </p>
            </Note>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="flex flex-col gap-6" aria-label={STEPS[4]}>
            <div className="folio flex flex-col gap-3 p-6">
              <p className="t-label text-[var(--color-ink-3)]">{EVENT_LABEL[d.eventKind]}</p>
              <p className="t-h3">{d.title || "Untitled case"}</p>
              <p className="t-body">{d.claim}</p>
              <p className="t-small text-[var(--color-ink-2)]">
                {d.propertyRef} &middot; {d.deadline ? `deadline ${termsTime(d.deadline, d.timeZone, "end")}` : "no deadline"}
                {d.windowStart ? ` · from ${termsTime(d.windowStart, d.timeZone, "start")}` : ""}
              </p>
            </div>
            <ol className="flex flex-col gap-2">
              {d.criteria.map((c, i) => (
                <li key={i} className="exhibit t-small">
                  <span className="font-semibold">{criterionName(`C${i + 1}`)}.</span> {c.text}
                  {c.needsIndependent ? <span className="block t-micro text-[var(--color-ink-3)]">Needs the inspector&apos;s evidence.</span> : null}
                </li>
              ))}
            </ol>
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-[220px_1fr] t-small">
              <dt className="text-[var(--color-ink-3)]">Evidence allowed</dt><dd>{d.allowed.map((k) => EVIDENCE_LABEL[k].toLowerCase()).join(", ")}</dd>
              <dt className="text-[var(--color-ink-3)]">Required</dt><dd>{d.required.length ? d.required.map((r) => requirementLabel(r.type, r.min)).join("; ") : "nothing in particular"}</dd>
              <dt className="text-[var(--color-ink-3)]">Held sum</dt><dd>{held > 0n ? `${gen(held)}, deposited by the ${d.funder.toLowerCase()}` : "none (record only)"}</dd>
              <dt className="text-[var(--color-ink-3)]">Challenge bond</dt><dd>{gen(parseGen(d.challengeBond || "0") ?? 0n)}</dd>
              <dt className="text-[var(--color-ink-3)]">Windows</dt>
              <dd>evidence {seconds(d.evidenceSeconds)}; challenge {seconds(d.challengeSeconds)}; new evidence in a challenge {seconds(d.challengeEvidenceSeconds)}</dd>
              <dt className="text-[var(--color-ink-3)]">Inspector</dt><dd>{d.inspector ? "named; must accept before evidence opens" : "none"}</dd>
              {d.followsCase ? <><dt className="text-[var(--color-ink-3)]">Follows</dt><dd>{caseIdFrom(d.followsCase) ? caseName(caseIdFrom(d.followsCase)) : d.followsCase}</dd></> : null}
            </dl>
            {warn.length ? (
              <Note tone="warn" title="Check before opening">
                <p>Your text looks like it contains {[...new Set(warn)].join(", ")}. It will be public and permanent.</p>
              </Note>
            ) : null}
            <label className="flex items-start gap-2 t-small">
              <input type="checkbox" className="mt-1" checked={d.acknowledged} onChange={(e) => set({ acknowledged: e.target.checked })} />
              <span>I understand that this case and everything filed on it are public and permanent on Studio Next, that a
                finding assesses evidence against these criteria and is not a legal determination, and that I cannot change
                these terms once the respondent accepts them.</span>
            </label>
            <Fold summary="What the contract receives">
              <pre className="t-mono whitespace-pre-wrap break-all">{JSON.stringify(terms, null, 2)}</pre>
            </Fold>
            {opened ? (
              <div className="folio flex flex-col gap-2 p-5" role="status">
                <p className="t-small flex items-center gap-2"><Icon name="check" /> {caseName(opened.cid)} is recorded.</p>
                {opened.waiting ? <p className="t-small">Writing it to the record; opening it in a moment...</p> : (
                  <p className="t-small">The network has not served it yet. <Link className="link" href={`/cases/${opened.cid}`}>Open {caseName(opened.cid)}</Link></p>
                )}
              </div>
            ) : (
              <Act label={revise ? `Publish terms version ${(revising?.t.version ?? 0) + 1}` : "Open the case"}
                method={revise ? "revise_terms" : "open_case"} can={can} caseId={revise || undefined} primary
                prepare={() => (revise ? [revise, JSON.stringify(terms)] : [JSON.stringify(terms)])}
                working="The contract checks every field and records the terms with their digest."
                onResult={onDone} />
            )}
          </section>
        ) : null}

        <Problems items={tried[step] ? problems : []} />

        <div className="flex flex-wrap gap-3 hair-t pt-6">
          {step > 0 ? <button type="button" className="btn" onClick={() => go(step - 1)}>Back</button> : null}
          {step < STEPS.length - 1 ? <button type="button" className="btn btn-primary" onClick={() => go(step + 1)}>Continue</button> : null}
        </div>
      </div>
    </div>
  );
}

function Revise({ cid }: { cid: string }) {
  const caseRead = useChain(`case.${cid}`, (fresh) => getCase(cid, fresh));
  const c = caseRead.data ?? null;
  const termsRead = useChain(c ? `terms.${cid}.${c.version}` : null, () => getTerms(cid, c?.version ?? 1));
  if (caseRead.error && !c) return <div className="shell py-12"><ReadFailure what="the case" error={caseRead.error} retrying={caseRead.retrying} /></div>;
  if (!c) return <div className="shell py-12">{caseRead.loading ? <Loading what="the case" /> : <Note title="There is no such case.">{null}</Note>}</div>;
  const t = termsRead.data;
  if (!t) return <div className="shell py-12"><Loading what="the terms" /></div>;
  return <Form initial={draftFromTerms(t)} revise={cid} revising={{ c, t }} />;
}

export function Wizard() {
  const params = useSearchParams();
  const revise = caseIdFrom(params.get("revise") ?? "");
  const onClient = useSyncExternalStore(subscribe, () => true, () => false);
  if (!CONTRACT_CONFIGURED) {
    return (
      <div className="shell py-12">
        <Note tone="warn" title="No deployment is configured for this build.">
          <p>See the <Link className="link" href="/status">network page</Link>.</p>
        </Note>
      </div>
    );
  }
  if (!onClient) return <div className="shell py-12"><p className="t-small text-[var(--color-ink-3)]">Loading the form...</p></div>;
  if (revise) return <Revise cid={revise} />;
  const saved = loadDraft();
  return <Form initial={saved ?? emptyDraft()} revise="" revising={null} restoredAt={saved?.savedAt ?? 0} />;
}
