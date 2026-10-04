"use client";

import Link from "next/link";
import { useState } from "react";

import { FindingChip, Fold, Loading, Machine, Note, ReadFailure, Section } from "@/components/bits";
import { useCase } from "@/components/case/CaseFrame";
import { EXPLORER, STUDIO_NEXT, txUrl } from "@/lib/chain";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { caseTransactions } from "@/lib/explorer";
import {
  caseName, criterionName, CUT_NOTE, cutShort, decisionName, exhibitName, gen, listLabels, local, prose, ROLE_LABEL,
  sentence, txLabel, utc,
} from "@/lib/present";
import { getReceipt } from "@/lib/read";
import { buildReceiptFile, RECEIPT_NOTICE, type ReceiptFile } from "@/lib/receipt";
import type { Finding } from "@/lib/types";
import { useChain } from "@/lib/useChain";

function download(file: ReceiptFile, cid: string) {
  const blob = new Blob([JSON.stringify(file, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `keywitness-${caseName(cid).toLowerCase().replace(/\s+/g, "-")}-${file.mode}-receipt.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ReceiptPage() {
  const { cid, c, t } = useCase();
  const zone = t.time_zone;
  const receipt = useChain(c.standing ? `receipt.${cid}` : null, (fresh) => getReceipt(cid, fresh));
  const txs = useChain(c.standing ? `explorer.${cid}` : null, () => caseTransactions(CONTRACT_ADDRESS, cid, c.created_at));
  const [busy, setBusy] = useState<"" | "private" | "public">("");
  const [error, setError] = useState("");

  const closed = ["FINAL", "DECLINED", "WITHDRAWN", "EXPIRED", "LAPSED"].includes(c.state);
  if (!c.standing) {
    return (
      <Note title={closed ? "This case has no receipt." : "No receipt yet."}>
        <p>
          {closed ? "It closed before any decision was recorded, and a receipt is the record of a decision."
            : "A receipt exists once a decision has been recorded on this case."}
        </p>
      </Note>
    );
  }
  if (receipt.error && !receipt.data) return <ReadFailure what="the receipt" error={receipt.error} retrying={receipt.retrying} />;
  if (!receipt.data) return <Loading what="the receipt" />;
  const { core, digest } = receipt.data;
  const d = core.decision;
  const final = core.case_state === "FINAL";
  const listed = [...(txs.data?.found ?? [])].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const transactions = listed.map((x) => ({ method: x.method, outcome: x.outcome, hash: x.hash, url: txUrl(x.hash) }));

  const make = async (mode: "private" | "public") => {
    setBusy(mode);
    setError("");
    try {
      const file = await buildReceiptFile({
        core, chainDigest: digest, mode, transactions, now: new Date(),
        searched: !txs.data ? "none" : txs.data.complete ? "all" : "newest",
        network: { name: "Studio Next", chain_id: STUDIO_NEXT.id, contract: CONTRACT_ADDRESS, explorer: EXPLORER },
      });
      download(file, cid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The receipt could not be built.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-10">
        {!final ? (
          <Note tone="warn" title="This decision is not final yet.">
            <p>
              It can still be challenged, readjudicated or finalized. A receipt made now records the standing decision as it
              is today; make a new one once the case is final.
            </p>
          </Note>
        ) : null}

        <Section title="Decision receipt" aside={`${caseName(cid)}, ${final ? "final" : "standing decision"}`}>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[200px_1fr]">
            <dt className="t-small text-[var(--color-ink-3)]">Claim</dt><dd className="t-small">{core.terms.claim}</dd>
            <dt className="t-small text-[var(--color-ink-3)]">Terms</dt>
            <dd className="t-small">Version {core.terms.version}, accepted by the respondent by its digest</dd>
            <dt className="t-small text-[var(--color-ink-3)]">Decision</dt>
            <dd className="t-small">{decisionName(d.decision_id)}, recorded {local(d.decided_at, zone)} ({utc(d.decided_at)})</dd>
            <dt className="t-small text-[var(--color-ink-3)]">Overall finding</dt>
            <dd><FindingChip value={d.overall} /></dd>
          </dl>
          <ul className="flex flex-col gap-3">
            {d.criteria.map((x) => (
              <li key={x.id} className="exhibit flex flex-col gap-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="t-small font-semibold">{criterionName(x.id)}</span>
                  <FindingChip value={x.finding as Finding} size="sm" />
                </span>
                <span className="t-small">{x.text}</span>
                <span className="t-micro text-[var(--color-ink-3)]">
                  {listLabels(x.finding)[0]}: {x.basis.length ? x.basis.map(exhibitName).join(", ") : "none"}.{" "}
                  {listLabels(x.finding)[1]}: {x.contrary.length ? x.contrary.map(exhibitName).join(", ") : "none"}.
                </span>
                {x.rationale ? (
                  <span className="t-small text-[var(--color-ink-2)]">
                    {prose(x.rationale)}{cutShort(x.rationale) ? ` ${CUT_NOTE}` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {core.history.length > 1 ? (
            <div className="flex flex-col gap-2">
              <h3 className="t-h3">Every decision on this case</h3>
              <ul className="flex flex-col gap-1">
                {core.history.map((h) => (
                  <li key={h.decision_id} className="t-small flex flex-wrap items-center gap-2">
                    {decisionName(h.decision_id)}, round {h.round}: <FindingChip value={h.overall} size="sm" />
                    <span className="text-[var(--color-ink-3)]">{h.status.toLowerCase().replace("_", " ")}, {utc(h.decided_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {core.challenge ? (
            <p className="t-small">
              Challenged by the {core.challenge.by.toLowerCase()} {utc(core.challenge.opened_at)}
              {core.challenge.outcome ? `; ${prose(core.challenge.outcome)}` : ""}
              {core.challenge.bond_to ? `; the bond went to the ${core.challenge.bond_to === "CHALLENGER" ? "challenger" : core.challenge.bond_to.toLowerCase()}` : ""}.
            </p>
          ) : null}
          {core.settlement ? (
            <p className="t-small">
              The held sum of {gen(core.settlement.held_sum_wei)} went to the{" "}
              {core.settlement.to_role === "DEPOSITOR" ? "depositor" : ROLE_LABEL[core.settlement.to_role].toLowerCase()}{" "}
              {utc(core.settlement.at)}.
            </p>
          ) : null}
        </Section>

        <Section title="Evidence this decision judged">
          <ul className="flex flex-col gap-2">
            {d.evidence.map((e) => (
              <li key={e.evidence_id} className="t-small flex flex-col">
                <span><span className="font-semibold">{exhibitName(e.evidence_id)}</span>, filed by the {ROLE_LABEL[e.role].toLowerCase()} {utc(e.filed_at)}{e.new_in_challenge ? ", during the challenge" : ""}</span>
                <span className="t-mono break-all text-[var(--color-ink-3)]">sha256 {e.sha256}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Transactions behind this case" aside="Found on the Studio Next explorer">
          {txs.error && !txs.data ? (
            <Note tone="warn" title="The explorer could not be reached.">
              <p>A receipt made now lists no transactions, and says so. The record itself is still verifiable from the contract.</p>
            </Note>
          ) : !txs.data ? <Loading what="the transactions" /> : (
            <ul className="flex flex-col gap-1">
              {listed.map((x) => (
                <li key={x.hash} className="t-small flex flex-col">
                  <span className={x.outcome === "recorded" ? undefined : "text-[var(--color-ink-2)]"}>
                    {txLabel(x.method, x.outcome)}{x.createdAt ? `, ${utc(x.createdAt)}` : ""}
                    {x.outcome === "refused" && x.reason ? `. ${sentence(x.reason)}` : ""}
                  </span>
                  <a className="link t-mono break-all" href={txUrl(x.hash)} target="_blank" rel="noreferrer">{x.hash}</a>
                </li>
              ))}
            </ul>
          )}
          {txs.data && !txs.data.complete ? (
            <p className="t-micro text-[var(--color-ink-3)]">
              The explorer was searched through the {txs.data.scanned} newest of this contract&apos;s {txs.data.total}{" "}
              transactions, so older transactions of this case may be missing from this list. The record does not depend on it.
            </p>
          ) : null}
          <p className="t-micro text-[var(--color-ink-3)]">
            The transaction that opened the case names no case number (the contract assigns it), so it is found from the
            claimant&apos;s history on the explorer rather than listed here.
          </p>
        </Section>
      </div>

      <aside className="flex flex-col gap-6" aria-label="Download and verify">
        <div className="folio flex flex-col gap-4 p-5">
          <h2 className="t-label text-[var(--color-ink-3)]">Download</h2>
          <div className="flex flex-col gap-1">
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void make("private")}>
              {busy === "private" ? "Building..." : "Private receipt (JSON)"}
            </button>
            <p className="t-micro text-[var(--color-ink-3)]">Everything the contract recorded, wallet addresses and the property reference included. For the parties.</p>
          </div>
          <div className="flex flex-col gap-1">
            <button type="button" className="btn" disabled={!!busy} onClick={() => void make("public")}>
              {busy === "public" ? "Building..." : "Public receipt (JSON)"}
            </button>
            <p className="t-micro text-[var(--color-ink-3)]">
              Leaves out the parties&apos; addresses, the property reference, the validators&apos; prose and the challenge
              reason. It still says which role a held sum or a bond went to, and it lists the case&apos;s transactions,
              which name the wallets that sent them. Digests and findings stay, so it still verifies against the chain.
            </p>
          </div>
          {error ? <p className="t-small text-[var(--color-adverse)]" role="alert">{error}</p> : null}
          <p className="t-micro text-[var(--color-ink-3)]">The time a receipt is made is written into it as its generation time, never as the time of any event.</p>
        </div>
        <div className="folio flex flex-col gap-3 p-5">
          <h2 className="t-label text-[var(--color-ink-3)]">Verify</h2>
          <p className="t-small text-[var(--color-ink-2)]">
            Anyone can check a receipt on the <Link className="link" href="/verify">verify page</Link>: it recomputes the
            digest of the file, then reads the contract and compares.
          </p>
          <Fold summary="Check it by hand">
            <ol className="t-small list-decimal pl-5 flex flex-col gap-1">
              <li>Call get_receipt with the case id on the contract below.</li>
              <li>Serialise the returned core as JSON with sorted keys, no spaces and ASCII escapes.</li>
              <li>Its sha256 must equal the digest returned beside it.</li>
            </ol>
            <Machine label="Case id" value={cid} />
            <Machine label="Contract" value={CONTRACT_ADDRESS} href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} />
            <Machine label="Receipt digest on chain now" value={digest} />
            <Machine label="Decision digest" value={d.decision_digest} />
            <Machine label="Evidence manifest digest" value={d.manifest_digest} />
            <Machine label="Terms digest" value={core.terms.digest} />
          </Fold>
        </div>
        <p className="t-micro text-[var(--color-ink-3)]">{RECEIPT_NOTICE}</p>
      </aside>
    </div>
  );
}
