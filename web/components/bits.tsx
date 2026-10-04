"use client";

/**
 * Small shared pieces. Findings always carry an icon and a word as well as a
 * colour, so no state depends on colour alone. Machine values (addresses,
 * digests, ids) appear only inside a Machine fold.
 */
import { useState, type ReactNode } from "react";

import { FINDING, STATE_LABEL } from "@/lib/present";
import type { CaseState, Finding } from "@/lib/types";

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor",
    strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "check": return <svg {...common}><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>;
    case "cross": return <svg {...common}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
    case "split": return <svg {...common}><path d="M8 2v4M8 6L3.5 13M8 6l4.5 7" /></svg>;
    case "gap": return <svg {...common}><circle cx="8" cy="8" r="5.5" strokeDasharray="2.4 2.2" /></svg>;
    case "dash": return <svg {...common}><path d="M3.5 8h9" /></svg>;
    case "clock": return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></svg>;
    case "lock": return <svg {...common}><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></svg>;
    case "info": return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M8 7.2v4M8 4.8v.1" /></svg>;
    case "copy": return <svg {...common}><rect x="5" y="5" width="8" height="8" rx="1" /><path d="M3 10.5V3h7.5" /></svg>;
    case "external": return <svg {...common}><path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" /></svg>;
    default: return null;
  }
}

export function FindingChip({ value, size = "md" }: { value: Finding | "" | null | undefined; size?: "md" | "sm" }) {
  if (!value) return <span className="chip chip-plain">No finding yet</span>;
  const f = FINDING[value];
  return (
    <span className={`chip chip-${f.tone}`} style={size === "sm" ? { fontSize: 13, padding: "2px 8px 2px 6px" } : undefined}>
      <Icon name={f.icon} size={size === "sm" ? 13 : 15} />
      {f.label}
    </span>
  );
}

const STAMP_TONE: Record<CaseState, string> = {
  DRAFT: "var(--color-ink-2)", OPEN: "var(--color-ink)", DETERMINED: "var(--color-ink)",
  UNDER_CHALLENGE: "var(--color-uncertain)", FINAL: "var(--color-ink)", DECLINED: "var(--color-ink-3)",
  WITHDRAWN: "var(--color-ink-3)", EXPIRED: "var(--color-ink-3)", LAPSED: "var(--color-ink-3)",
};

const STAMP_ON_DARK: Record<CaseState, string> = {
  DRAFT: "var(--color-on-navy-2)", OPEN: "var(--color-on-navy)", DETERMINED: "var(--color-on-navy)",
  UNDER_CHALLENGE: "var(--color-uncertain-bright)", FINAL: "var(--color-on-navy)", DECLINED: "var(--color-on-navy-2)",
  WITHDRAWN: "var(--color-on-navy-2)", EXPIRED: "var(--color-on-navy-2)", LAPSED: "var(--color-on-navy-2)",
};

export function StateStamp({ state, onDark = false }: { state: CaseState; onDark?: boolean }) {
  return <span className="stamp" style={{ color: (onDark ? STAMP_ON_DARK : STAMP_TONE)[state] }}>{STATE_LABEL[state]}</span>;
}

export function Note({ tone = "info", title, children }: { tone?: "info" | "warn" | "privacy"; title?: string; children: ReactNode }) {
  const border = tone === "warn" ? "var(--color-uncertain)" : tone === "privacy" ? "var(--color-ink)" : "var(--color-rule)";
  return (
    <div className="folio p-4" style={{ borderLeft: `4px solid ${border}` }} role={tone === "warn" ? "alert" : undefined}>
      {title ? <p className="t-small font-semibold">{title}</p> : null}
      <div className="t-small text-[var(--color-ink-2)]">{children}</div>
    </div>
  );
}

export function Machine({ label, value, href }: { label: string; value: string; href?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1 py-2 hair-b last:border-b-0">
      <span className="t-micro text-[var(--color-ink-3)]">{label}</span>
      <span className="flex items-start gap-2">
        <span className="t-mono break-all">{value || "not available"}</span>
        {value ? (
          <button type="button" className="text-[var(--color-ink-3)] hover:text-[var(--color-ink)]" aria-label={`Copy ${label}`}
            onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
            <Icon name="copy" />
          </button>
        ) : null}
        {href ? <a className="text-[var(--color-ink-3)] hover:text-[var(--color-ink)]" href={href} target="_blank" rel="noreferrer" aria-label={`Open ${label} on the explorer`}><Icon name="external" /></a> : null}
        {copied ? <span className="t-micro">copied</span> : null}
      </span>
    </div>
  );
}

export function Fold({ summary, children, open = false }: { summary: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="hair" open={open}>
      <summary className="cursor-pointer px-4 py-3 t-small font-semibold">{summary}</summary>
      <div className="px-4 pb-3">{children}</div>
    </details>
  );
}

export function Loading({ what }: { what: string }) {
  return <p className="t-small text-[var(--color-ink-3)]" role="status">Reading {what} from Studio Next...</p>;
}

export function ReadFailure({ what, error, retrying }: { what: string; error?: unknown; retrying?: boolean }) {
  // Only the app's own sentences are shown; what a library raised is not wording for a person.
  const text = error instanceof Error && error.name === "ReadError" ? error.message : "";
  return (
    <Note tone="warn" title={`Could not read ${what}.`}>
      <p>{text || "Studio Next did not answer this read."} {retrying ? "Trying again shortly." : "Reload the page to try again."}</p>
    </Note>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="folio p-6 t-small text-[var(--color-ink-2)]">{children}</div>;
}

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: ReactNode; id?: string }) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={id}>
      <span className="t-small font-semibold">{label}</span>
      {children}
      {hint ? <span className="t-micro text-[var(--color-ink-3)]">{hint}</span> : null}
      {error ? <span className="t-micro text-[var(--color-adverse)]">{error}</span> : null}
    </label>
  );
}

export function Section({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="flex flex-col gap-4 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-3 hair-b pb-2">
        <h2 className="t-h3">{title}</h2>
        {aside ? <div className="t-small text-[var(--color-ink-3)]">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}
