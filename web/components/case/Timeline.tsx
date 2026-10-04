"use client";

/**
 * The case's own log, as the contract recorded it: every step, who took it
 * (by role) and when. Newest first. This is chain state, not something this
 * browser remembers.
 */
import { useState } from "react";

import { FindingChip, Loading, ReadFailure } from "@/components/bits";
import { roleOf } from "@/lib/acts";
import { eventText, local, plural, ROLE_LABEL, utc } from "@/lib/present";
import { getEvents } from "@/lib/read";
import type { Case } from "@/lib/types";
import { useChain } from "@/lib/useChain";

const PAGE = 50;

export function Timeline({ c, zone }: { c: Case; zone: string }) {
  const [pages, setPages] = useState(1);
  const first = useChain(`events.${c.case_id}.0`, (fresh) => getEvents(c.case_id, 0, PAGE, fresh));
  const more = useChain(pages > 1 ? `events.${c.case_id}.${PAGE}` : null,
    (fresh) => getEvents(c.case_id, PAGE, PAGE, fresh));

  if (first.error && !first.data) return <ReadFailure what="the case log" error={first.error} retrying={first.retrying} />;
  if (!first.data) return <Loading what="the case log" />;
  const rows = [...first.data.events, ...(more.data?.events ?? [])];
  const total = first.data.total;

  return (
    <div className="flex flex-col gap-4">
      <ol className="rail flex flex-col gap-5" aria-label="Case log, newest first">
        {rows.map((e) => {
          const said = eventText(e, zone);
          const role = roleOf(c, e.by) || (c.inspector && e.by.toLowerCase() === c.inspector.toLowerCase() ? "INSPECTOR" : "");
          return (
            <li key={e.n} className="rail-node flex flex-col gap-1" data-state="done">
              <span className="t-small flex flex-wrap items-center gap-2">
                <span>{said.text}</span>
                {said.finding ? <FindingChip value={said.finding} size="sm" /> : null}
              </span>
              <span className="t-micro text-[var(--color-ink-3)]">
                {local(e.at, zone)} &middot; {utc(e.at)} &middot; {role ? `signed by the ${ROLE_LABEL[role].toLowerCase()}`
                  : "signed by a wallet with no role on the case"}
              </span>
            </li>
          );
        })}
      </ol>
      {total > rows.length && pages === 1 ? (
        <button type="button" className="btn self-start" onClick={() => setPages(2)}>
          Show earlier entries ({plural(total - rows.length, "more entry", "more entries")})
        </button>
      ) : null}
      {pages > 1 && more.loading ? <Loading what="earlier entries" /> : null}
    </div>
  );
}
