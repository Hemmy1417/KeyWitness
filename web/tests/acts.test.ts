/**
 * The app offers exactly what the contract allows. Every row was produced by
 * calling the real contract (under the direct-test runtime) for each act,
 * each role and many case states; acts() must agree with every verdict.
 * Regenerate with: python scripts/web_fixtures.py
 */
import { describe, expect, it } from "vitest";

import { acts } from "@/lib/acts";
import type { Case, Decision, Evidence, Terms } from "@/lib/types";

import rows from "./fixtures/acts.json";

interface Row {
  label: string;
  case: Case;
  terms: Terms;
  decision: Decision | null;
  evidence: Evidence[];
  addr: string;
  now: number;
  owed: string;
  expected: Record<string, boolean>;
}

describe("act availability mirrors the contract", () => {
  it("covers every act in many states", () => {
    expect((rows as unknown as Row[]).length).toBeGreaterThan(60);
    const states = new Set((rows as unknown as Row[]).map((r) => r.case.state));
    for (const s of ["DRAFT", "OPEN", "DETERMINED", "UNDER_CHALLENGE", "FINAL"]) expect(states.has(s as Case["state"])).toBe(true);
  });

  for (const r of rows as unknown as Row[]) {
    it(r.label, () => {
      const a = acts({ c: r.case, t: r.terms, d: r.decision, evidence: r.evidence, addr: r.addr, now: r.now, owed: BigInt(r.owed) });
      const got = {
        revise: a.revise.ok, accept: a.accept.ok, decline: a.decline.ok, withdrawCase: a.withdrawCase.ok,
        acceptInspector: a.acceptInspector.ok, fund: a.fund.ok, expire: a.expire.ok,
        "file:PHOTO": a.file("PHOTO").ok, "file:TEXT_DOCUMENT": a.file("TEXT_DOCUMENT").ok, ready: a.ready.ok,
        assess: a.assess.ok, lapse: a.lapse.ok, challenge: a.challenge.ok, readjudicate: a.readjudicate.ok,
        closeChallenge: a.closeChallenge.ok, finalize: a.finalize.ok, withdraw: a.withdraw.ok,
      };
      expect(got).toEqual(r.expected);
    });
  }

  it("gives a reason for every act it withholds", () => {
    for (const r of rows as unknown as Row[]) {
      const a = acts({ c: r.case, t: r.terms, d: r.decision, evidence: r.evidence, addr: r.addr, now: r.now, owed: BigInt(r.owed) });
      for (const can of [a.revise, a.accept, a.decline, a.withdrawCase, a.acceptInspector, a.fund, a.expire, a.ready,
        a.assess, a.lapse, a.challenge, a.readjudicate, a.closeChallenge, a.finalize, a.withdraw, a.file("PHOTO")]) {
        if (!can.ok) expect(can.why.length).toBeGreaterThan(10);
      }
    }
  });

  it("asks for a wallet before anything a wallet must sign", () => {
    const r = (rows as unknown as Row[])[0]!;
    const a = acts({ c: r.case, t: r.terms, d: r.decision, evidence: r.evidence, addr: "", now: r.now });
    expect(a.accept).toEqual({ ok: false, why: "Connect a wallet." });
    expect(a.file("PHOTO").why).toBe("Connect a wallet.");
  });
});
