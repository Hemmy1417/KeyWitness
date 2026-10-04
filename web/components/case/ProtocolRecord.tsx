"use client";

/**
 * The transactions that asked validators to judge this case, found on the
 * Studio Next explorer (the contract cannot see its own transaction hashes),
 * each followed through GenLayer's own lifecycle: stored status, the
 * protocol's next action, consensus, and a protocol appeal while its window
 * is open. Nothing here is inferred from the case record.
 */
import { useState } from "react";

import { Loading, Note } from "@/components/bits";
import { ProtocolTracker } from "@/components/ProtocolTracker";
import { useCase } from "./CaseFrame";
import { roleOf } from "@/lib/acts";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { caseTransactions } from "@/lib/explorer";
import { local, ROLE_LABEL } from "@/lib/present";
import { useChain } from "@/lib/useChain";

const JUDGED: Record<string, string> = {
  request_assessment: "Assessment request",
  readjudicate: "Readjudication request",
};

const OUTCOME: Record<string, string> = {
  recorded: "recorded a decision",
  refused: "refused by the contract",
  undecided: "no decision by the validators, nothing recorded",
  unknown: "",
};

export function ProtocolRecord() {
  const { cid, c, t } = useCase();
  const found = useChain(`explorer.${cid}`, () => caseTransactions(CONTRACT_ADDRESS, cid, c.created_at));
  const [open, setOpen] = useState<string | null>(null);

  if (found.error && !found.data) {
    return (
      <Note tone="warn" title="The explorer could not be reached.">
        <p>Each decision is still on chain and shown above; the transactions behind them will be listed here once the explorer answers.</p>
      </Note>
    );
  }
  if (!found.data) return <Loading what="the transactions behind these decisions" />;
  const rows = found.data.found.filter((x) => x.method in JUDGED).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const partial = found.data.complete ? null : (
    <p className="t-micro text-[var(--color-ink-3)] measure">
      The explorer was searched through the {found.data.scanned} newest of this contract&apos;s {found.data.total} transactions.
      Older requests on this case are not listed here; the decisions they recorded are above, on chain.
    </p>
  );
  if (!rows.length) {
    return (
      <div className="flex flex-col gap-2">
        <p className="t-small text-[var(--color-ink-2)]">
          {c.decisions.length ? "The requests behind these decisions were not found among the transactions searched."
            : "No assessment has been requested on this case yet."}
        </p>
        {partial}
      </div>
    );
  }
  const newest = rows[0]?.hash ?? null;
  const shown = open ?? newest;
  return (
    <div className="flex flex-col gap-3">
    <ul className="flex flex-col gap-4">
      {rows.map((x) => {
        const role = roleOf(c, x.from);
        return (
          <li key={x.hash} className="folio flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="t-small font-semibold">
                {JUDGED[x.method]}{OUTCOME[x.outcome] ? <span className="font-normal text-[var(--color-ink-2)]">: {OUTCOME[x.outcome]}</span> : null}
              </span>
              <span className="t-micro text-[var(--color-ink-3)]">
                {x.createdAt ? local(x.createdAt, t.time_zone) : ""}{role ? `, sent by the ${ROLE_LABEL[role].toLowerCase()}` : ", sent by a wallet with no role"}
              </span>
            </div>
            {shown === x.hash ? <ProtocolTracker hash={x.hash} offerAppeal />
              : <button type="button" className="btn self-start" onClick={() => setOpen(x.hash)}>Show its protocol status</button>}
          </li>
        );
      })}
    </ul>
    {partial}
    </div>
  );
}
