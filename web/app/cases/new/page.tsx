import type { Metadata } from "next";
import { Suspense } from "react";

import { Wizard } from "@/components/wizard/Wizard";

export const metadata: Metadata = {
  title: "Open a case",
  description: "Agree the claim and the criteria before any evidence is weighed.",
};

export default function NewCasePage() {
  return (
    <Suspense fallback={<div className="shell py-12"><p className="t-small text-[var(--color-ink-3)]">Loading the form...</p></div>}>
      <Wizard />
    </Suspense>
  );
}
