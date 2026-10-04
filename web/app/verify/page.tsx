"use client";

/**
 * Check a receipt file: that nothing in it was edited, that this browser
 * reproduces the contract's own digest, and that the chain still holds the
 * record it describes. It says what was verified and, as plainly, what a
 * receipt can never prove.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { FindingChip, Icon, Note } from "@/components/bits";
import { STUDIO_NEXT, txUrl } from "@/lib/chain";
import { caseName, decisionName, txLabel, utc } from "@/lib/present";
import { getDecisionFrom, getReceiptFrom, ReadError } from "@/lib/read";
import { parseReceiptFile, verifyReceipt, type CheckResult, type ReceiptFile, type Verification } from "@/lib/receipt";
import { fetchTx } from "@/lib/txresult";
import { outcomeOfStatus, protocolStatus, STATUS_TEXT } from "@/lib/txstatus";
import type { Decision, Finding } from "@/lib/types";

interface TxCheck {
  hash: string;
  method: string;
  found: boolean;
  status: string;
  /** What the network's own record says the transaction did; never taken from the file. */
  outcome: "recorded" | "refused" | "undecided" | "unknown";
  toContract: boolean;
}

function Line({ result, title, children }: { result: CheckResult; title: string; children?: ReactNode }) {
  const tone = result === "pass" ? "text-[var(--color-supported)]" : result === "fail" ? "text-[var(--color-adverse)]" : "text-[var(--color-ink-3)]";
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 ${tone}`} aria-hidden="true"><Icon name={result === "pass" ? "check" : result === "fail" ? "cross" : "dash"} /></span>
      <span className="flex flex-col gap-0.5">
        <span className="t-small font-semibold">
          <span className="sr-only">{result === "pass" ? "Passed: " : result === "fail" ? "Failed: " : "Not checked: "}</span>{title}
        </span>
        {children ? <span className="t-small text-[var(--color-ink-2)]">{children}</span> : null}
      </span>
    </li>
  );
}

export default function VerifyPage() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<ReceiptFile | null>(null);
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState<Verification | null>(null);
  const [chainNote, setChainNote] = useState("");
  const [txs, setTxs] = useState<TxCheck[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (raw: string) => {
    setProblem("");
    setResult(null);
    setTxs(null);
    setChainNote("");
    const parsed = parseReceiptFile(raw);
    if (typeof parsed === "string") {
      setFile(null);
      setProblem(parsed);
      return;
    }
    setFile(parsed);
    setBusy(true);
    try {
      let chain = null;
      let chainDecision: Decision | null = null;
      if (parsed.network.chain_id !== STUDIO_NEXT.id) {
        setChainNote(`The receipt names chain ${parsed.network.chain_id}; this page reads Studio Next (${STUDIO_NEXT.id}) only.`);
      } else if (!/^0x[0-9a-fA-F]{40}$/.test(parsed.network.contract)) {
        setChainNote("The receipt names no valid contract address.");
      } else {
        try {
          chain = await getReceiptFrom(parsed.network.contract as `0x${string}`, parsed.case_id);
          if (!chain) setChainNote("The contract the receipt names holds no such case.");
          // The decision the file names is read on its own: it never changes, whatever the case did afterwards.
          const did = String((parsed.core as { decision?: { decision_id?: string } }).decision?.decision_id ?? "");
          if (chain && /^D-[0-9]{4,12}$/.test(did)) {
            chainDecision = await getDecisionFrom(parsed.network.contract as `0x${string}`, did);
          }
        } catch (e) {
          setChainNote(e instanceof ReadError ? e.message : "Studio Next did not answer; only the file was checked.");
        }
      }
      setResult(await verifyReceipt(parsed, chain, chainDecision));
      const checks: TxCheck[] = [];
      for (const x of parsed.transactions.slice(0, 40)) {
        try {
          const tx = await fetchTx(x.hash);
          const to = String(tx.to_address ?? tx.recipient ?? tx.to ?? "").toLowerCase();
          const s = protocolStatus(x.hash, tx, null, null);
          checks.push({ hash: x.hash, method: x.method, found: true, status: s.stored, outcome: outcomeOfStatus(s, tx),
            toContract: !!to && to === parsed.network.contract.toLowerCase() });
        } catch {
          checks.push({ hash: x.hash, method: x.method, found: false, status: "UNKNOWN", outcome: "unknown", toContract: false });
        }
      }
      setTxs(checks);
    } finally {
      setBusy(false);
    }
  };

  const core = file?.core as { decision?: { decision_id?: string; overall?: Finding }; case_state?: string } | undefined;

  return (
    <div className="shell flex flex-col gap-10 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="t-h1">Verify a receipt</h1>
        <p className="t-body text-[var(--color-ink-2)] measure">
          Paste a KeyWitness receipt or choose the file. This page checks that the file was not edited, recomputes the
          contract&apos;s digest, and compares the file with what the contract holds now. Nothing you check here is sent
          anywhere except the read it makes to Studio Next.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="t-small font-semibold">Receipt file</span>
            <input type="file" accept="application/json,.json" className="field" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 2_000_000) { setProblem("That file is too large to be a receipt."); return; }
              const raw = await f.text();
              setText(raw);
              void run(raw);
            }} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="t-small font-semibold">Or paste it</span>
            <textarea className="field t-mono min-h-[220px]" value={text} onChange={(e) => setText(e.target.value)}
              placeholder='{"schema": "keywitness.receipt-file/1", ...}' spellCheck={false} />
          </label>
          <button type="button" className="btn btn-primary self-start" disabled={!text.trim() || busy} onClick={() => void run(text)}>
            {busy ? "Checking..." : "Check this receipt"}
          </button>
          {problem ? <p className="t-small text-[var(--color-adverse)]" role="alert">{problem}</p> : null}
        </div>

        <div className="flex flex-col gap-6" aria-live="polite">
          {file && result ? (
            <div className="folio flex flex-col gap-5 p-6">
              <div className="flex flex-col gap-1">
                <p className="t-label text-[var(--color-ink-3)]">{file.mode === "public" ? "Public receipt" : "Private receipt"}</p>
                <p className="t-h3">{caseName(file.case_id)}{core?.decision?.decision_id ? `, ${decisionName(core.decision.decision_id)}` : ""}</p>
                {/* The finding is shown only once the chain confirms it: a file is a claim until then. */}
                {core?.decision?.overall && (result.chain === "pass" || result.decision === "pass")
                  ? <span><FindingChip value={core.decision.overall} /></span> : null}
                <p className="t-micro text-[var(--color-ink-3)]">File made {utc(file.generated_at)}; that is when it was generated, not when anything happened.</p>
              </div>
              {result.integrity === "fail" ? (
                <Note tone="warn" title="This file was edited">
                  <p>What it says is not what any receipt said when it was made. Do not rely on anything in it.</p>
                </Note>
              ) : null}
              <ul className="flex flex-col gap-4">
                <Line result={result.integrity} title="The file was not edited">
                  {result.integrity === "pass" ? "The record inside matches the digest the file carries." : "The record inside does not match its own digest."}
                </Line>
                <Line result={result.reproduced} title="The contract's digest is reproducible here">
                  {result.reproduced === "skipped" ? "The chain was not read." : result.reproduced === "pass"
                    ? "This browser recomputed the digest of the contract's record and got the contract's value." : "It did not match; see below."}
                </Line>
                <Line result={result.decision} title="The decision is a decision the contract holds">
                  {result.decision === "skipped"
                    ? (result.integrity === "fail" ? "Not compared: the file was edited." : "The decision was not read from the chain.")
                    : result.decision === "pass" ? "Its digest, recomputed from this file, is the one on the chain."
                      : "The chain holds no such decision with this content."}
                </Line>
                <Line result={result.movedOn ? "skipped" : result.chain}
                  title={result.movedOn ? "The case has moved on since this receipt" : "The chain holds this record now"}>
                  {result.chain === "skipped" ? chainNote || "Not checked against the chain."
                    : result.movedOn ? "A true receipt, out of date: the decision stands as recorded, the case around it changed."
                      : result.integrity === "fail" ? "An edited file is a copy of no record." : null}
                </Line>
              </ul>
              {result.chain !== "pass" && chainNote && result.chain !== "skipped" ? <p className="t-small">{chainNote}</p> : null}
              {result.notes.length ? (
                <ul className="t-small flex flex-col gap-1 list-disc pl-5">{result.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              ) : null}
              {result.chain === "skipped" ? (
                <Note tone="warn" title="Locally checked only">
                  <p>This file was checked against itself, not against the chain. Treat it as unverified until the chain check passes.</p>
                </Note>
              ) : null}
            </div>
          ) : null}

          {txs ? (
            <div className="folio flex flex-col gap-3 p-6">
              <p className="t-small font-semibold">Transactions the receipt lists</p>
              <p className="t-small text-[var(--color-ink-2)]">
                {file?.transactions_searched === "all" ? "When the receipt was made, the explorer was searched over the whole life of the case."
                  : file?.transactions_searched === "newest" ? "When the receipt was made, the explorer search stopped early, so older transactions of the case may be missing here."
                    : "When the receipt was made, no explorer search answered, so it lists what it had."}
                {" "}The record above does not depend on this list.
              </p>
              {!txs.length ? <p className="t-small text-[var(--color-ink-2)]">The receipt lists none.</p> : (
                <ul className="flex flex-col gap-2">
                  {txs.map((x) => (
                    <li key={x.hash} className="t-small flex flex-col">
                      <span className="font-semibold">{txLabel(x.method, x.outcome)}</span>
                      <span className="text-[var(--color-ink-2)]">{x.found ? `${STATUS_TEXT[x.status as keyof typeof STATUS_TEXT] ?? "Found"}${x.toContract ? "; sent to the contract the receipt names" : "; not sent to the contract the receipt names"}` : "Not found on Studio Next"}</span>
                      <a className="link t-mono break-all" href={txUrl(x.hash)} target="_blank" rel="noreferrer">{x.hash}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="folio flex flex-col gap-2 p-6">
            <p className="t-small font-semibold">What a passing check means, and what it does not</p>
            <p className="t-small text-[var(--color-ink-2)]">
              It proves the receipt is a true copy, or a faithful public redaction, of what the KeyWitness contract
              recorded. It does not prove that any photograph is authentic, that any date is genuine, or that the event
              happened, and a finding is an assessment of evidence against agreed criteria, not a legal determination.
            </p>
            <p className="t-small text-[var(--color-ink-2)]">
              Need one to try? Every case with a decision has a <Link className="link" href="/cases">receipt page</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
