import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Verify a receipt", description: "Check a KeyWitness receipt against the contract on Studio Next." };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
