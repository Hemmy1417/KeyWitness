import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CaseFrame } from "@/components/case/CaseFrame";
import { caseName } from "@/lib/present";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const cid = decodeURIComponent(id).trim().toUpperCase();
  return { title: /^KW-\d+$/.test(cid) ? caseName(cid) : "Case" };
}

export default async function CaseLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { id } = await params;
  return <CaseFrame id={id}>{children}</CaseFrame>;
}
