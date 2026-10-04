"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Wordmark } from "./Logo";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/cases", label: "Cases" },
  { href: "/cases/new", label: "New case" },
  { href: "/verify", label: "Verify a receipt" },
  { href: "/sample", label: "Sample case" },
  { href: "/status", label: "Network" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/cases"
    ? path === "/cases" || (path.startsWith("/cases/") && path !== "/cases/new")
    : path === href);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip">Skip to content</a>
      <div className="bg-[var(--color-uncertain-bright)] text-[var(--color-navy)]">
        <p className="shell py-1.5 t-micro font-semibold">
          Studio Next test network. Every amount is test GEN, and everything filed is public and permanent.
        </p>
      </div>
      <header className="plate">
        <div className="shell flex flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/" aria-label="KeyWitness home" className="text-[var(--color-on-navy)]"><Wordmark size={34} /></Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
                className={`rounded px-3 py-2 t-small font-semibold ${active(n.href)
                  ? "bg-[var(--color-navy-3)] text-white" : "text-[var(--color-on-navy-2)] hover:text-white"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <WalletButton />
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="plate mt-20">
        <div className="shell grid gap-8 py-10 md:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-3">
            <Wordmark size={26} />
            <p className="t-small muted measure">
              KeyWitness is an evidence assessment and recordkeeping tool. It is not a court, a lawyer or a title registry,
              it does not guarantee legal admissibility, and a finding never establishes legal liability or proves that an
              event happened.
            </p>
          </div>
          <div className="flex flex-col gap-2 t-small">
            <Link className="link muted" href="/status">Network and contract</Link>
            <Link className="link muted" href="/verify">Verify a receipt</Link>
            <Link className="link muted" href="/sample">Sample case (synthetic)</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
