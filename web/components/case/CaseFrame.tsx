"use client";

/**
 * One read of a case for every view under /cases/[id]: the case, the terms
 * that govern it (the current draft version, or the accepted one), the
 * standing decision, the evidence, and what this wallet may do. Each view
 * reads it from context instead of asking the chain again.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";

import { FindingChip, Loading, Note, ReadFailure, StateStamp } from "@/components/bits";
import { acts, type Acts } from "@/lib/acts";
import { CONTRACT_CONFIGURED } from "@/lib/config";
import { caseName, EVENT_LABEL, plural, ROLE_LABEL } from "@/lib/present";
import { getCase, getCaseEvidence, getCredit, getDecision, getTerms } from "@/lib/read";
import { CLOSED, type Case, type Decision, type Evidence, type Terms } from "@/lib/types";
import { useChain } from "@/lib/useChain";
import { useNow } from "@/lib/useNow";
import { useWallet } from "@/lib/wallet";

export interface CaseData {
  cid: string;
  c: Case;
  /** The terms in force: the current version while a draft awaits acceptance, the accepted one after. */
  t: Terms;
  d: Decision | null;
  evidence: Evidence[];
  /** The evidence list is still loading. */
  evidenceLoading: boolean;
  a: Acts;
  addr: string;
  now: number;
  owed: bigint;
  reload: () => void;
}

const Ctx = createContext<CaseData | null>(null);

export function useCase(): CaseData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCase outside a case page");
  return v;
}

export function CaseFrame({ id, children }: { id: string; children: ReactNode }) {
  const cid = decodeURIComponent(id).trim().toUpperCase();
  const w = useWallet();
  const clock = useNow();
  const path = usePathname();

  const caseRead = useChain(CONTRACT_CONFIGURED ? `case.${cid}` : null, (fresh) => getCase(cid, fresh));
  const c = caseRead.data ?? null;
  const version = c ? (c.accepted_version || c.version) : 0;
  const termsRead = useChain(c ? `terms.${cid}.${version}` : null, () => getTerms(cid, version));
  const decisionRead = useChain(c?.standing ? `decision.${c.standing}` : null,
    (fresh) => getDecision(c?.standing ?? "", fresh));
  const evidenceRead = useChain(c ? `caseevidence.${cid}` : null, (fresh) => getCaseEvidence(cid, fresh));
  const creditRead = useChain(w.address && c ? `credit.${w.address}` : null, () => getCredit(w.address));

  if (!CONTRACT_CONFIGURED) {
    return (
      <div className="shell py-12">
        <Note tone="warn" title="No deployment is configured for this build.">
          <p>Set the contract address and reload. The <Link className="link" href="/status">network page</Link> says what is missing.</p>
        </Note>
      </div>
    );
  }
  if (caseRead.error && !c) {
    return <div className="shell py-12"><ReadFailure what="this case" error={caseRead.error} retrying={caseRead.retrying} /></div>;
  }
  if (caseRead.loading && !c) return <div className="shell py-12"><Loading what="the case" /></div>;
  if (!c) {
    return (
      <div className="shell flex flex-col gap-4 py-16">
        <h1 className="t-h1">There is no {/^KW-\d+$/.test(cid) ? caseName(cid) : "such case"} on this deployment</h1>
        <p className="t-body text-[var(--color-ink-2)] measure">
          A case appears here once the transaction that opened it is recorded. If you just opened it, give the network a
          moment and reload.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link className="btn" href="/cases">See every case</Link>
          <Link className="btn" href="/cases/new">Open a case</Link>
        </div>
      </div>
    );
  }
  const t = termsRead.data ?? null;
  if (!t) {
    return (
      <div className="shell py-12">
        {termsRead.error ? <ReadFailure what="the terms" error={termsRead.error} retrying={termsRead.retrying} />
          : <Loading what="the terms" />}
      </div>
    );
  }

  // What a view says about a case depends on its standing decision and its
  // evidence, so nothing is shown until both have been read: an absent
  // decision must mean there is none, never that it is still on its way.
  const d = decisionRead.data ?? null;
  if (c.standing && !d) {
    return (
      <div className="shell py-12">
        {decisionRead.error ? <ReadFailure what="the decision" error={decisionRead.error} retrying={decisionRead.retrying} />
          : <Loading what="the decision" />}
      </div>
    );
  }
  if (evidenceRead.data === undefined) {
    return (
      <div className="shell py-12">
        {evidenceRead.error ? <ReadFailure what="the evidence" error={evidenceRead.error} retrying={evidenceRead.retrying} />
          : <Loading what="the evidence" />}
      </div>
    );
  }
  const evidence = evidenceRead.data;
  const owed = BigInt(creditRead.data?.owed ?? "0");
  const now = clock;
  const a = acts({ c, t, d, evidence, addr: w.address, now, owed });
  const reload = () => {
    caseRead.reload();
    decisionRead.reload();
    evidenceRead.reload();
    creditRead.reload();
  };

  const closed = CLOSED.includes(c.state);
  const termsNote = c.accepted_version ? "accepted by the respondent"
    : c.state === "DECLINED" ? "declined by the respondent"
      : c.state === "WITHDRAWN" ? "withdrawn before the respondent accepted"
        : c.state === "EXPIRED" ? "never accepted" : "awaiting the respondent";
  const base = `/cases/${cid}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/evidence`, label: evidence.length ? `Evidence (${evidence.length})` : "Evidence" },
    { href: `${base}/decision`, label: c.decisions.length > 1 ? `Decisions (${c.decisions.length})` : "Decision" },
    { href: `${base}/receipt`, label: "Receipt" },
  ];

  return (
    <Ctx.Provider value={{ cid, c, t, d, evidence, evidenceLoading: evidenceRead.loading, a, addr: w.address, now, owed, reload }}>
      <section className="plate">
        <div className="shell flex flex-col gap-5 pt-8">
          <nav aria-label="Breadcrumb" className="t-small muted">
            <Link className="link" href="/cases">Cases</Link> <span aria-hidden="true">/</span> {caseName(cid)}
          </nav>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <p className="t-label muted">{caseName(cid)} &middot; {EVENT_LABEL[t.event_kind]}</p>
              <h1 className="t-h1 measure">{t.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StateStamp state={c.state} onDark />
              {d ? <span className="rounded bg-[var(--color-folio)]"><FindingChip value={d.overall} /></span> : null}
            </div>
          </div>
          <p className="t-small muted">
            {a.role ? <>You are the <span className="font-semibold text-[var(--color-on-navy)]">{ROLE_LABEL[a.role].toLowerCase()}</span> on this case. </> :
              closed ? "" : w.address ? "Your wallet has no role on this case; you can follow it and take the steps anyone may take. "
                : "Connect a wallet to act on this case. "}
            Terms version {t.version}, {termsNote}
            {c.decisions.length ? `; ${plural(c.decisions.length, "decision")} recorded` : ""}.
          </p>
          <nav aria-label="Case sections" className="-mb-px flex flex-wrap gap-1">
            {tabs.map((x) => {
              const on = path === x.href;
              return (
                <Link key={x.href} href={x.href} aria-current={on ? "page" : undefined}
                  className={`px-4 py-3 t-small font-semibold border-b-2 ${on
                    ? "border-[var(--color-uncertain-bright)] text-white" : "border-transparent muted hover:text-white"}`}>
                  {x.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>
      <div className="shell py-10">{children}</div>
    </Ctx.Provider>
  );
}
