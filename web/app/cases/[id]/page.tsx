"use client";

import type { ReactNode } from "react";

import { Section } from "@/components/bits";
import { useCase } from "@/components/case/CaseFrame";
import { ClaimCard } from "@/components/case/Claim";
import { CaseRail, Money, Parties, VerifyCase, Windows } from "@/components/case/Facts";
import { NextSteps } from "@/components/case/Steps";
import { TermsHistory } from "@/components/case/TermsHistory";
import { Timeline } from "@/components/case/Timeline";

function Aside({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="folio flex flex-col gap-3 p-5">
      <h2 className="t-label text-[var(--color-ink-3)]">{title}</h2>
      {children}
    </div>
  );
}

export default function CaseOverview() {
  const { c, t } = useCase();
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-12">
        <Section title="What happens next"><NextSteps /></Section>
        <Section title="Claim and criteria" aside={`Terms version ${t.version}`}>
          <ClaimCard t={t} accepted={!!c.accepted_version} />
        </Section>
        {c.version > 1 ? <Section title="Other versions of the terms"><TermsHistory /></Section> : null}
        <Section title="Case log" aside="Newest first, as the contract recorded it">
          <Timeline c={c} zone={t.time_zone} />
        </Section>
      </div>
      <aside className="flex flex-col gap-6" aria-label="Case facts">
        <Aside title="Where the case is"><CaseRail /></Aside>
        <Aside title="Parties"><Parties /></Aside>
        <Aside title="Money"><Money /></Aside>
        <Aside title="Windows"><Windows /></Aside>
        <VerifyCase />
      </aside>
    </div>
  );
}
