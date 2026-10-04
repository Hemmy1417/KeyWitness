"use client";

/**
 * One write, end to end: price it against the network's live fee policy,
 * show the person exactly what leaves their wallet, have the wallet sign,
 * follow the kit until the validators decide, then hand over to the
 * protocol tracker until the transaction is final.
 *
 * The transaction and its value are frozen when the flow opens, so a
 * re-render cannot re-price or change what is about to be signed.
 */
import {
  formatGen as kitGen, useTransactionFlow, type SubmitInput, type TransactionKit,
} from "@genlayer/transaction-kit-react";
import { useCallback, useEffect, useState } from "react";

import { Fold } from "./bits";
import { ProtocolTracker, type FinalOutcome } from "./ProtocolTracker";
import { plural } from "@/lib/present";
import { rememberSent } from "@/lib/sent";
import { returnedJson } from "@/lib/txresult";
import { flowError } from "@/lib/txstatus";

const PHASES = ["submitted", "pending", "processing", "decided"] as const;
const PHASE_TEXT: Record<(typeof PHASES)[number], string> = {
  submitted: "Signed and submitted",
  pending: "Queued on the network",
  processing: "Validators are executing it",
  decided: "Decided by the validators",
};

export interface FlowResult {
  outcome: FinalOutcome;
  hash: string;
  /** The JSON the contract returned, when it returned one. */
  returned: Record<string, unknown> | null;
}

export function TxFlow({ kit, tx: txProp, value: valueProp, confirmText, working, caseId, offerAppeal, onDone, onClose }: {
  kit: TransactionKit;
  tx: SubmitInput;
  value?: bigint;
  confirmText: string;
  working?: string;
  caseId?: string;
  offerAppeal?: boolean;
  onDone?: (r: FlowResult) => void;
  onClose?: () => void;
}) {
  const [tx] = useState(txProp);
  const [value] = useState(valueProp);
  const flow = useTransactionFlow({ kit, tx, userValue: value, trackUntil: "decided" });
  const { state } = flow;
  const [outcome, setOutcome] = useState<FinalOutcome | null>(null);

  const status = state.step === "tracking" || state.step === "done" ? state.status : null;
  const hash = status?.genlayerTxId ?? null;
  const method = tx.kind === "write" ? tx.method : "deploy";

  useEffect(() => {
    if (hash && caseId) rememberSent(caseId, { hash, method });
  }, [hash, caseId, method]);

  const onFinal = useCallback((o: FinalOutcome) => {
    setOutcome(o);
    if (!hash) return;
    if (o === "recorded") {
      void returnedJson<Record<string, unknown>>(hash).then((r) => {
        onDone?.({ outcome: o, hash, returned: r });
      }).catch(() => returnedJson<Record<string, unknown>>(hash).then((r) => {
        // One more read: what the write returned (a case id, an exhibit id) is how the page finds what it made.
        onDone?.({ outcome: o, hash, returned: r });
      }).catch(() => onDone?.({ outcome: o, hash, returned: null })));
    } else onDone?.({ outcome: o, hash, returned: null });
  }, [hash, onDone]);

  const box = "folio p-5 flex flex-col gap-4";

  if (state.step === "estimating") {
    return <div className={box}><p className="t-small" role="status">Pricing this against the network&apos;s live fee policy...</p></div>;
  }
  if (state.step === "blocked") {
    return (
      <div className={box}>
        <p className="t-h3">The fee quote no longer matches the network</p>
        <p className="t-small text-[var(--color-ink-2)]">Nothing was signed.</p>
        <button type="button" className="btn self-start" onClick={() => flow.reset()}>Price it again</button>
      </div>
    );
  }
  if (state.step === "error") {
    const err = flowError(state.message);
    return (
      <div className={box} role="alert">
        <p className="t-h3">{err.title}</p>
        <p className="t-small text-[var(--color-ink-2)]">{err.detail}</p>
        {state.message && err.detail !== state.message.trim() ? (
          <Fold summary="What the wallet or the network reported">
            <p className="t-mono break-words">{state.message.slice(0, 400)}</p>
          </Fold>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn" onClick={() => flow.reset()}>Start over</button>
          {onClose ? <button type="button" className="btn" onClick={onClose}>Close</button> : null}
        </div>
      </div>
    );
  }
  if (state.step === "review" || state.step === "signing") {
    const q = state.quote;
    const signing = state.step === "signing";
    return (
      <div className={box}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="t-h3">Review before signing</p>
          {q.verification.status === "verified" ? <span className="t-micro text-[var(--color-ink-3)]">Fee policy verified</span> : null}
        </div>
        <dl className="flex flex-col gap-2">
          {value && value > 0n ? (
            <div className="flex justify-between gap-4"><dt className="t-small">Sent to the contract</dt><dd className="t-mono">{kitGen(value)} GEN</dd></div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="t-small">Refundable fee deposit</dt><dd className="t-mono">{q.gasless ? "None" : `${kitGen(q.feeValue)} GEN`}</dd>
          </div>
          <div className="flex justify-between gap-4 hair-t pt-2 font-semibold">
            <dt className="t-small">Total leaving your wallet</dt><dd className="t-mono">{kitGen(q.total)} GEN</dd>
          </div>
        </dl>
        {q.queue?.pendingAhead ? <p className="t-small text-[var(--color-ink-2)]">{plural(q.queue.pendingAhead, "transaction")} queued on this contract ahead of yours.</p> : null}
        <p className="t-micro text-[var(--color-ink-3)]">Prices are live; unused fees are refunded when the transaction settles.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" disabled={signing} onClick={() => void flow.approve()}>
            {signing ? "Waiting for your wallet..." : confirmText}
          </button>
          <button type="button" className="btn" disabled={signing} onClick={() => { flow.reset(); onClose?.(); }}>Cancel</button>
        </div>
      </div>
    );
  }

  const phaseIdx = status ? PHASES.indexOf(status.phase as (typeof PHASES)[number]) : -1;
  const decided = state.step === "done";
  return (
    <div className={box}>
      <ol className="rail flex flex-col gap-2" aria-label="Transaction progress">
        {PHASES.map((p, i) => {
          const reached = i < phaseIdx || decided;
          const now = i === phaseIdx && !decided;
          return (
            <li key={p} className="rail-node t-small" data-state={reached ? "done" : now ? "now" : undefined}>
              {PHASE_TEXT[p]}
              {now && p === "pending" && status?.queuePosition !== undefined ? `, position ${status.queuePosition}` : ""}
              {now && p === "processing" && working ? <span className="block text-[var(--color-ink-3)]">{working}</span> : null}
            </li>
          );
        })}
      </ol>
      {decided && hash ? <ProtocolTracker hash={hash} offerAppeal={offerAppeal} announce onFinal={onFinal} /> : null}
      {!decided && flow.canCancel ? (
        <button type="button" className="btn self-start" onClick={() => void flow.cancel()}>Cancel while still queued</button>
      ) : null}
      {outcome && onClose ? <button type="button" className="btn self-start" onClick={onClose}>Close</button> : null}
    </div>
  );
}
