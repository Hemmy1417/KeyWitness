"use client";

/**
 * A page that failed to draw. Nothing on chain is affected by it: what was
 * signed is recorded or it is not, and the case page says which.
 */
import Link from "next/link";

export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="shell flex flex-col gap-4 py-16" role="alert">
      <h1 className="t-h1">This page could not be shown</h1>
      <p className="t-body text-[var(--color-ink-2)] measure">
        Something went wrong while drawing it. Nothing on the chain was changed by this. If you had just signed
        something, open the case again to see whether it was recorded before trying a second time.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        <Link className="btn" href="/cases">Cases</Link>
      </div>
    </div>
  );
}
