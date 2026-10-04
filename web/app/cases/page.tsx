"use client";

/**
 * Cases: the ones this wallet is part of, grouped by where they stand, and
 * every case on the deployment, newest first. Everything shown is read from
 * the contract; nothing is a count this app invented.
 */
import Link from "next/link";
import { useState } from "react";

import { FindingChip, Loading, Note, ReadFailure, StateStamp } from "@/components/bits";
import { same } from "@/lib/acts";
import { CONTRACT_CONFIGURED } from "@/lib/config";
import { caseName, day, EVENT_LABEL, gen, plural, ROLE_LABEL } from "@/lib/present";
import { casesOf, listCases } from "@/lib/read";
import type { CaseState, CaseSummary, EventKind, Role } from "@/lib/types";
import { useChain } from "@/lib/useChain";
import { useNow } from "@/lib/useNow";
import { useWallet } from "@/lib/wallet";

const GROUPS: { key: string; title: string; hint: string; states: CaseState[] }[] = [
  { key: "draft", title: "Terms being agreed", hint: "Waiting for the respondent, the inspector or the deposit.", states: ["DRAFT"] },
  { key: "open", title: "Open for evidence", hint: "Filing evidence, or ready for the assessment.", states: ["OPEN"] },
  { key: "decided", title: "Decided, open to challenge", hint: "A decision stands; check it before the window closes.", states: ["DETERMINED"] },
  { key: "challenge", title: "Under challenge", hint: "New evidence, then a readjudication.", states: ["UNDER_CHALLENGE"] },
  { key: "final", title: "Final", hint: "Settled; receipts available.", states: ["FINAL"] },
  { key: "closed", title: "Closed without a decision", hint: "Declined, withdrawn, expired or lapsed.", states: ["DECLINED", "WITHDRAWN", "EXPIRED", "LAPSED"] },
];

const DAY = 86_400_000;

interface Filters {
  group: string;
  kind: "" | EventKind;
  role: "" | Role;
  since: "" | "7" | "30";
}

function roleIn(c: CaseSummary, addr: string): Role | "" {
  if (same(addr, c.claimant)) return "CLAIMANT";
  if (same(addr, c.respondent)) return "RESPONDENT";
  if (c.inspector && same(addr, c.inspector)) return "INSPECTOR";
  return "";
}

function keep(c: CaseSummary, f: Filters, addr: string, now: number): boolean {
  if (f.group && !GROUPS.find((g) => g.key === f.group)?.states.includes(c.state)) return false;
  if (f.kind && c.event_kind !== f.kind) return false;
  if (f.role && roleIn(c, addr) !== f.role) return false;
  if (f.since && now && now - new Date(c.updated_at).getTime() > Number(f.since) * DAY) return false;
  return true;
}

function Row({ c, addr }: { c: CaseSummary; addr: string }) {
  const role = addr ? roleIn(c, addr) : "";
  return (
    <li>
      <Link href={`/cases/${c.case_id}`} className="folio grid gap-3 p-5 hover:bg-white md:grid-cols-[1fr_auto] md:items-center">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="t-micro text-[var(--color-ink-3)]">
            {caseName(c.case_id)} &middot; {EVENT_LABEL[c.event_kind]}{role ? ` · you are the ${ROLE_LABEL[role].toLowerCase()}` : ""}
          </span>
          <span className="t-h3 truncate">{c.title}</span>
          <span className="t-micro text-[var(--color-ink-3)]">
            {BigInt(c.held_sum_wei || "0") ? `${gen(c.held_sum_wei)} held` : "Record only"} &middot; last change {day(c.updated_at)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <StateStamp state={c.state} />
          {c.overall ? <FindingChip value={c.overall} size="sm" /> : null}
        </span>
      </Link>
    </li>
  );
}

function FilterBar({ f, set, mine }: { f: Filters; set: (f: Filters) => void; mine: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Filter cases">
      <label className="flex flex-col gap-1">
        <span className="t-micro font-semibold">Stage</span>
        <select className="field" value={f.group} onChange={(e) => set({ ...f, group: e.target.value })}>
          <option value="">Every stage</option>
          {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.title}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-micro font-semibold">Kind of case</span>
        <select className="field" value={f.kind} onChange={(e) => set({ ...f, kind: e.target.value as Filters["kind"] })}>
          <option value="">Every kind</option>
          {(Object.keys(EVENT_LABEL) as EventKind[]).map((k) => <option key={k} value={k}>{EVENT_LABEL[k]}</option>)}
        </select>
      </label>
      {mine ? (
        <label className="flex flex-col gap-1">
          <span className="t-micro font-semibold">Your role</span>
          <select className="field" value={f.role} onChange={(e) => set({ ...f, role: e.target.value as Filters["role"] })}>
            <option value="">Any role</option>
            {(["CLAIMANT", "RESPONDENT", "INSPECTOR"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="t-micro font-semibold">Last change</span>
        <select className="field" value={f.since} onChange={(e) => set({ ...f, since: e.target.value as Filters["since"] })}>
          <option value="">Any time</option>
          <option value="7">In the last 7 days</option>
          <option value="30">In the last 30 days</option>
        </select>
      </label>
    </div>
  );
}

function Mine({ addr, f }: { addr: string; f: Filters }) {
  const now = useNow();
  const read = useChain(`casesof.${addr}`, (fresh) => casesOf(addr, 0, 50, fresh));
  if (read.error && !read.data) return <ReadFailure what="your cases" error={read.error} retrying={read.retrying} />;
  if (!read.data) return <Loading what="your cases" />;
  if (!read.data.total) {
    return (
      <Note title="This wallet is not part of any case yet.">
        <p>Open a case as the claimant, or ask the other party to name this wallet as the respondent or the inspector.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link className="btn btn-primary" href="/cases/new">Open a case</Link>
          <Link className="btn" href="/sample">See the sample case</Link>
        </div>
      </Note>
    );
  }
  const shown = read.data.cases.filter((c) => keep(c, f, addr, now));
  if (!shown.length) return <p className="t-small text-[var(--color-ink-2)]">None of your cases match these filters.</p>;
  return (
    <div className="flex flex-col gap-10">
      {GROUPS.map((g) => {
        const rows = shown.filter((c) => g.states.includes(c.state));
        if (!rows.length) return null;
        return (
          <section key={g.key} className="flex flex-col gap-3" aria-label={g.title}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="t-h3">{g.title} <span className="t-small font-normal text-[var(--color-ink-3)]">({rows.length})</span></h3>
              <span className="t-micro text-[var(--color-ink-3)]">{g.hint}</span>
            </div>
            <ul className="flex flex-col gap-2">{rows.map((c) => <Row key={c.case_id} c={c} addr={addr} />)}</ul>
          </section>
        );
      })}
      {read.data.total > read.data.cases.length ? (
        <p className="t-micro text-[var(--color-ink-3)]">Showing your {read.data.cases.length} most recent of {read.data.total}.</p>
      ) : null}
    </div>
  );
}

const PAGE = 30;

function AllPage({ skip, f, addr, last, onMore }: { skip: number; f: Filters; addr: string; last: boolean; onMore: () => void }) {
  const now = useNow();
  const read = useChain(`cases.${skip}`, (fresh) => listCases(skip, PAGE, fresh));
  if (read.error && !read.data) return <li className="list-none"><ReadFailure what="the cases" error={read.error} retrying={read.retrying} /></li>;
  if (!read.data) return <li className="list-none"><Loading what="the cases" /></li>;
  const rows = read.data.cases.filter((c) => keep(c, f, addr, now));
  return (
    <>
      {skip === 0 && !read.data.total ? (
        <li className="list-none">
          <Note title="No cases on this deployment yet.">
            <p>The first one could be yours. <Link className="link" href="/cases/new">Open a case</Link> or <Link className="link" href="/sample">explore the sample</Link>.</p>
          </Note>
        </li>
      ) : null}
      {rows.map((c) => <Row key={c.case_id} c={c} addr={addr} />)}
      {last && read.data.total > skip + PAGE ? (
        <li className="list-none"><button type="button" className="btn" onClick={onMore}>
          Show older cases ({plural(read.data.total - skip - PAGE, "more")})
        </button></li>
      ) : null}
    </>
  );
}

export default function CasesPage() {
  const w = useWallet();
  const [view, setView] = useState<"" | "mine" | "all">("");
  const [pages, setPages] = useState(1);
  const [f, setF] = useState<Filters>({ group: "", kind: "", role: "", since: "" });
  const tab = view || (w.address ? "mine" : "all");

  return (
    <div className="shell flex flex-col gap-8 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="t-h1">Cases</h1>
          <p className="t-body text-[var(--color-ink-2)] measure">
            Every case is public on Studio Next. Yours are grouped by what they are waiting for.
          </p>
        </div>
        <Link className="btn btn-primary" href="/cases/new">Open a case</Link>
      </header>

      {!CONTRACT_CONFIGURED ? (
        <Note tone="warn" title="No deployment is configured for this build.">
          <p>See the <Link className="link" href="/status">network page</Link>.</p>
        </Note>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Which cases">
            <button type="button" role="tab" aria-selected={tab === "mine"} className={`btn ${tab === "mine" ? "btn-primary" : ""}`}
              onClick={() => setView("mine")}>Your cases</button>
            <button type="button" role="tab" aria-selected={tab === "all"} className={`btn ${tab === "all" ? "btn-primary" : ""}`}
              onClick={() => setView("all")}>Every case</button>
          </div>
          <FilterBar f={f} set={setF} mine={tab === "mine"} />
          {tab === "mine" ? (
            w.address ? <Mine addr={w.address} f={f} /> : (
              <Note title="Connect a wallet to see the cases you are part of.">
                <p>Or browse every case on this deployment.</p>
              </Note>
            )
          ) : (
            <ul className="flex flex-col gap-2">
              {Array.from({ length: pages }, (_, i) => (
                <AllPage key={i} skip={i * PAGE} f={f} addr={w.address} last={i === pages - 1} onMore={() => setPages((n) => n + 1)} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
