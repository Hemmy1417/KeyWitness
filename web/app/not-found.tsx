import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell flex flex-col gap-4 py-16">
      <h1 className="t-h1">There is no page here</h1>
      <p className="t-body text-[var(--color-ink-2)] measure">
        The address may be mistyped, or the page may have moved. Cases are listed under Cases, and a receipt can be
        checked on the Verify page.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link className="btn btn-primary" href="/cases">Cases</Link>
        <Link className="btn" href="/verify">Verify a receipt</Link>
        <Link className="btn" href="/">Home</Link>
      </div>
    </div>
  );
}
