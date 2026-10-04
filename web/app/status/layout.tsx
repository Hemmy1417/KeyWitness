import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Network and contract", description: "The network, the contract and the configuration this build uses." };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
