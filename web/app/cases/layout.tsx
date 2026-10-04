import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: { default: "Cases", template: "%s | KeyWitness" }, description: "Property evidence cases on Studio Next." };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
