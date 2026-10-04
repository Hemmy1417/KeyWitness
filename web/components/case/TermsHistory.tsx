"use client";

/**
 * Every published version of the terms stays on chain. A version is read
 * only when someone opens it, and kept for good once read (it can never
 * change).
 */
import { useState } from "react";

import { Loading, Machine, ReadFailure } from "@/components/bits";
import { useCase } from "./CaseFrame";
import { criterionName, utc } from "@/lib/present";
import { getTerms } from "@/lib/read";
import { useChain } from "@/lib/useChain";

function Version({ cid, v, label }: { cid: string; v: number; label: string }) {
  const [open, setOpen] = useState(false);
  const read = useChain(open ? `terms.${cid}.${v}` : null, () => getTerms(cid, v));
  return (
    <details className="hair" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer px-4 py-3 t-small font-semibold">{label}</summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {read.error ? <ReadFailure what={`terms version ${v}`} error={read.error} retrying={read.retrying} />
          : !read.data ? <Loading what={`terms version ${v}`} /> : (
            <>
              <p className="t-micro text-[var(--color-ink-3)]">Published {utc(read.data.published_at)}</p>
              <p className="t-small"><span className="font-semibold">Claim:</span> {read.data.claim}</p>
              <ol className="flex flex-col gap-1">
                {read.data.criteria.map((x) => (
                  <li key={x.id} className="t-small"><span className="font-semibold">{criterionName(x.id)}:</span> {x.text}</li>
                ))}
              </ol>
              <Machine label="Digest" value={read.data.digest} />
            </>
          )}
      </div>
    </details>
  );
}

export function TermsHistory() {
  const { cid, c, t } = useCase();
  const versions = Array.from({ length: c.version }, (_, i) => i + 1).filter((v) => v !== t.version);
  if (!versions.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="t-small text-[var(--color-ink-2)] measure">
        The claimant revised the terms before the respondent accepted. Each version stays on chain exactly as it was
        published; only version {c.accepted_version || c.version} {c.accepted_version ? "was accepted and governs this case" : "awaits acceptance"}.
      </p>
      {versions.map((v) => <Version key={v} cid={cid} v={v} label={`Terms version ${v}${v > (c.accepted_version || 0) && c.accepted_version ? " (published after acceptance)" : ""}`} />)}
    </div>
  );
}
