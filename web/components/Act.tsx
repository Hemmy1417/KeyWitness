"use client";

/**
 * One act on the contract. Available: a button that opens the write flow.
 * Unavailable: the reason in words, never a button that fails.
 *
 * What is signed is what was on screen when the flow opened. The arguments
 * are built once, at opening; the fields the act carries are locked while
 * the flow is open, and a flow never survives the act becoming unavailable,
 * so it cannot come back later holding arguments from before an edit.
 */
import { useState, type ReactNode } from "react";

import { TxFlow, type FlowResult } from "./TxFlow";
import type { Can } from "@/lib/acts";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { useTransactionKit } from "@/lib/kit";
import { useWallet } from "@/lib/wallet";

export function Act({ label, method, args, value, can, caseId, offerAppeal, working, primary, prepare, onResult, onOpenChange, children, hideWhenUnavailable }: {
  label: string;
  method: string;
  args?: unknown[];
  value?: bigint;
  can: { ok: boolean; why: string } | Can;
  caseId?: string;
  offerAppeal?: boolean;
  working?: string;
  primary?: boolean;
  /** Build the arguments at the moment of opening; return a sentence to refuse locally. */
  prepare?: () => unknown[] | string;
  onResult?: (r: FlowResult) => void;
  /** Told when the write flow opens and closes, so a form outside this act can lock itself meanwhile. */
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  hideWhenUnavailable?: boolean;
}) {
  const w = useWallet();
  const kit = useTransactionKit();
  const [open, setOpen] = useState<unknown[] | null>(null);
  const [problem, setProblem] = useState("");

  if (!can.ok) {
    // Drop a flow opened earlier: its arguments belong to what the form held then.
    if (open) setOpen(null);
    if (hideWhenUnavailable) return null;
    return (
      <div className="flex flex-col gap-1">
        <button type="button" className="btn self-start" disabled>{label}</button>
        <p className="t-micro text-[var(--color-ink-3)]">{can.why}</p>
      </div>
    );
  }

  const start = () => {
    const built = prepare ? prepare() : args ?? [];
    if (typeof built === "string") {
      setProblem(built);
      return;
    }
    setProblem("");
    setOpen(built);
    onOpenChange?.(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {children ? <fieldset disabled={!!open} className="flex min-w-0 flex-col gap-3">{children}</fieldset> : null}
      {!open ? (
        <div className="flex flex-col gap-1">
          <button type="button" className={`btn self-start ${primary ? "btn-primary" : ""}`} disabled={!kit} onClick={start}>{label}</button>
          {!w.address ? <p className="t-micro text-[var(--color-ink-3)]">Connect a wallet to sign.</p>
            : !w.chainOk ? <p className="t-micro text-[var(--color-ink-3)]">Switch the wallet to Studio Next to sign.</p> : null}
        </div>
      ) : kit ? (
        <TxFlow kit={kit} tx={{ kind: "write", address: CONTRACT_ADDRESS, method, args: open }} value={value}
          confirmText={label} working={working} caseId={caseId} offerAppeal={offerAppeal}
          onClose={() => { setOpen(null); onOpenChange?.(false); }} onDone={onResult} />
      ) : null}
      {problem ? <p className="t-small text-[var(--color-adverse)]" role="alert">{problem}</p> : null}
    </div>
  );
}
