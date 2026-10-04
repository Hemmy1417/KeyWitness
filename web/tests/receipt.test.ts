/**
 * The browser's canonical JSON is the contract's, byte for byte, so a digest
 * computed here equals the one computed on chain. Fixtures come from the
 * contract's own _canon and get_receipt (python scripts/web_fixtures.py).
 */
import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/lib/hash";
import {
  buildReceiptFile, canonical, decisionDigestOf, digestOf, parseReceiptFile, publicCore, publicDecision,
  namesContract, RECEIPT_FILE_SCHEMA, verifyDecision, verifyReceipt,
} from "@/lib/receipt";
import { RECORD_ADDRESS } from "@/lib/config";
import type { ReceiptCore } from "@/lib/types";

import canon from "./fixtures/canon.json";
import chain from "./fixtures/receipt.json";

const network = { name: "Studio Next", chain_id: 61997, contract: RECORD_ADDRESS, explorer: "x" };
const now = new Date("2026-10-03T00:00:00Z");
const core = (chain as unknown as { core: ReceiptCore; digest: string }).core;
const digest = (chain as unknown as { core: ReceiptCore; digest: string }).digest;

describe("canonical JSON", () => {
  for (const [i, c] of (canon as { value: unknown; canonical: string; sha256: string }[]).entries()) {
    it(`matches the contract for value ${i}`, async () => {
      expect(canonical(c.value)).toBe(c.canonical);
      expect(await sha256Hex(c.canonical)).toBe(c.sha256);
    });
  }

  it("escapes DEL the way Python does", () => {
    expect(canonical("a\u007fb")).toBe('"a\\u007fb"');
  });

  it("refuses fractional numbers, which receipts never carry", () => {
    expect(() => canonical({ x: 1.5 })).toThrow();
  });
});

describe("receipts", () => {
  it("reproduce the contract's digest from its record", async () => {
    expect(await digestOf(core)).toBe(digest);
  });

  it("a private file verifies against the chain", async () => {
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "private", network, transactions: [], now });
    expect(file.schema).toBe(RECEIPT_FILE_SCHEMA);
    expect(file.core_digest).toBe(digest);
    const v = await verifyReceipt(file, { core, digest });
    expect(v).toMatchObject({ integrity: "pass", reproduced: "pass", chain: "pass", changedSince: false });
  });

  it("a public file leaves out the parties and the property, and still verifies", async () => {
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "public", network, transactions: [], now });
    const text = JSON.stringify(file);
    for (const secret of [core.parties.claimant, core.parties.respondent, core.terms.property_ref]) {
      expect(text.includes(secret)).toBe(false);
    }
    expect(text.includes("declared_capture")).toBe(false);
    const v = await verifyReceipt(file, { core, digest });
    expect(v.chain).toBe("pass");
    expect(publicCore(core)).toEqual(file.core);
  });

  it("no check passes for an edited file that kept its old digest, and it is never called a faithful copy", async () => {
    for (const mode of ["private", "public"] as const) {
      const file = await buildReceiptFile({ core, chainDigest: digest, mode, network, transactions: [], now });
      const edited = JSON.parse(JSON.stringify(file));
      edited.core.decision.overall = edited.core.decision.overall === "SUPPORTED" ? "NOT_ESTABLISHED" : "SUPPORTED";
      const v = await verifyReceipt(edited, { core, digest }, core.decision);
      // The digest the file carries is still the chain's. That must not count for anything.
      expect(edited.core_digest).toBe(file.core_digest);
      expect(v.integrity).toBe("fail");
      expect(v.chain).toBe("fail");
      expect(v.decision).toBe("skipped");
      expect(v.movedOn).toBe(false);
      expect(v.notes.join(" ")).not.toContain("faithful");
      expect(v.notes.join(" ")).not.toContain("exactly what the contract holds");
    }
  });

  it("an edited file fails its own integrity check", async () => {
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "private", network, transactions: [], now });
    const edited = JSON.parse(JSON.stringify(file));
    edited.core.decision.overall = "NOT_ESTABLISHED";
    const v = await verifyReceipt(edited, { core, digest });
    expect(v.integrity).toBe("fail");
  });

  it("a file whose core and digest were both rewritten still fails against the chain", async () => {
    const forged = JSON.parse(JSON.stringify(core)) as ReceiptCore;
    forged.decision.overall = "SUPPORTED";
    forged.case_state = "FINAL";
    forged.terms.claim = "Something else entirely.";
    const file = await buildReceiptFile({ core: forged, chainDigest: digest, mode: "private", network, transactions: [], now });
    const v = await verifyReceipt(file, { core, digest });
    expect(v.integrity).toBe("fail");
    expect(v.chain).toBe("fail");
  });

  it("says when the chain moved on since the file was made", async () => {
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "private", network, transactions: [], now });
    const later = JSON.parse(JSON.stringify(core)) as ReceiptCore;
    later.history = [...later.history, { ...later.history[0]!, decision_id: "D-9999" }];
    const v = await verifyReceipt(file, { core: later, digest: await digestOf(later) });
    expect(v.chain).toBe("fail");
    expect(v.changedSince).toBe(true);
  });

  it("does not trust a chain digest it cannot reproduce", async () => {
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "private", network, transactions: [], now });
    const v = await verifyReceipt(file, { core, digest: "0".repeat(64) });
    expect(v.reproduced).toBe("fail");
    expect(v.chain).toBe("fail");
  });

  it("without the chain, says it checked the file only", async () => {
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "public", network, transactions: [], now });
    const v = await verifyReceipt(file, null);
    expect(v.chain).toBe("skipped");
    expect(v.notes.join(" ")).toMatch(/only an integrity check/);
  });

  it("parses only KeyWitness receipt files", () => {
    expect(parseReceiptFile("not json")).toBe("This is not JSON.");
    expect(parseReceiptFile("{}")).toBe("This is not a KeyWitness receipt file.");
  });
});

describe("a receipt whose case has moved on, against one that was made up", () => {
  const decision = core.decision;
  // The fixture is the case once final. This is the same case as it stood before: decided, not yet settled.
  const earlier = (): ReceiptCore => {
    const c = JSON.parse(JSON.stringify(core)) as ReceiptCore;
    c.case_state = "DETERMINED";
    c.decision.status = "STANDING";
    c.history = c.history.map((h) => ({ ...h, status: "STANDING" }));
    c.settlement = null;
    return c;
  };
  const receiptThen = async (mode: "private" | "public") => {
    const then = earlier();
    return buildReceiptFile({ core: then, chainDigest: await digestOf(then), mode, network, transactions: [], now });
  };

  it("recomputes the decision's own digest from a private receipt", async () => {
    expect(await decisionDigestOf(decision as unknown as Record<string, unknown>)).toBe(decision.decision_digest);
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "private", network, transactions: [], now });
    expect(await verifyDecision(file, decision)).toBe("pass");
    const v = await verifyReceipt(file, { core, digest }, decision);
    expect(v).toMatchObject({ chain: "pass", decision: "pass", movedOn: false });
  });

  for (const mode of ["private", "public"] as const) {
    it(`calls an honest ${mode} receipt out of date, not false, once the case is settled`, async () => {
      const file = await receiptThen(mode);
      const v = await verifyReceipt(file, { core, digest }, decision);
      expect(v).toMatchObject({ integrity: "pass", reproduced: "pass", chain: "fail", decision: "pass", movedOn: true,
        changedSince: true });
      expect(v.notes.join(" ")).toMatch(/on the chain, unchanged\. The case has moved on/);
      expect(v.notes.join(" ")).toMatch(/it is final now/);
      expect(v.notes.join(" ")).toMatch(/Only the decision, the terms and the parties/);
      expect(v.decisionStatus).toBe(decision.status);
    });

    it(`refuses a ${mode} file whose decision is not the chain's, however its digests were rewritten`, async () => {
      const forged = JSON.parse(JSON.stringify(core)) as ReceiptCore;
      forged.decision.overall = "NOT_ESTABLISHED";
      forged.decision.criteria[0]!.finding = "NOT_ESTABLISHED";
      // The forger recomputes every digest they can and names a chain digest of their own making.
      forged.decision.decision_digest = await decisionDigestOf(forged.decision as unknown as Record<string, unknown>);
      const file = await buildReceiptFile({ core: forged, chainDigest: await digestOf(forged), mode, network,
        transactions: [], now });
      const v = await verifyReceipt(file, { core, digest }, decision);
      expect(v.integrity).toBe("pass");
      expect(v).toMatchObject({ chain: "fail", decision: "fail", movedOn: false });
      expect(v.notes.join(" ")).toMatch(/not a decision the contract holds/);
    });
  }

  it("still finds the decision when a later one stands in its place", async () => {
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "private", network, transactions: [], now });
    const superseded = { ...decision, status: "SUPERSEDED" as const, superseded_by: "D-0002" };
    const now2 = JSON.parse(JSON.stringify(core)) as ReceiptCore;
    now2.decision = { ...now2.decision, decision_id: "D-0002", round: 2, supersedes: decision.decision_id };
    const v = await verifyReceipt(file, { core: now2, digest: await digestOf(now2) }, superseded);
    expect(v).toMatchObject({ decision: "pass", movedOn: true });
    expect(v.notes.join(" ")).toMatch(/a later decision now stands/);
  });

  for (const mode of ["private", "public"] as const) {
    it(`refuses a made-up ${mode} record wrapped around a real decision of the case`, async () => {
      const forged = earlier();
      forged.terms.claim = "The claimant was paid in full and owes nothing.";
      const file = await buildReceiptFile({ core: forged, chainDigest: await digestOf(forged), mode, network,
        transactions: [], now });
      const v = await verifyReceipt(file, { core, digest }, decision);
      expect(v).toMatchObject({ integrity: "pass", chain: "fail", decision: "pass", movedOn: false });
      expect(v.notes.join(" ")).toMatch(/terms or the parties around it are not the ones the contract holds/);
    });

    it(`refuses a ${mode} file that carries another case's decision`, async () => {
      const file = await receiptThen(mode);
      // The chain's record for the case the file names does not list this decision.
      const other = JSON.parse(JSON.stringify(core)) as ReceiptCore;
      other.history = other.history.map((h) => ({ ...h, decision_id: "D-0999" }));
      const v = await verifyReceipt(file, { core: other, digest: await digestOf(other) }, decision);
      expect(v).toMatchObject({ chain: "fail", decision: "fail", movedOn: false, decisionStatus: "" });
      expect(v.notes.join(" ")).toMatch(/not a decision of the case the file names/);
      // And a decision that says it belongs to another case is refused whatever the history lists.
      const v2 = await verifyReceipt(file, { core, digest }, { ...decision, case_id: "KW-9999" });
      expect(v2.movedOn).toBe(false);
    });
  }

  it("checks a file only against the contract this app reads", async () => {
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "private", network, transactions: [], now });
    expect(namesContract(file, RECORD_ADDRESS)).toBe(true);
    expect(namesContract(file, RECORD_ADDRESS.toLowerCase())).toBe(true);
    expect(namesContract({ ...file, network: { ...file.network, contract: "0x" + "ab".repeat(20) } }, RECORD_ADDRESS)).toBe(false);
  });

  it("does not trust a chain decision whose digest it cannot reproduce", async () => {
    const file = await buildReceiptFile({ core, chainDigest: digest, mode: "private", network, transactions: [], now });
    expect(await verifyDecision(file, { ...decision, overall: "NOT_ESTABLISHED" })).toBe("fail");
  });

  it("says it could not tell, when the decision was not read from the chain", async () => {
    const file = await receiptThen("private");
    const v = await verifyReceipt(file, { core, digest });
    expect(v).toMatchObject({ chain: "fail", decision: "skipped", movedOn: false });
    expect(v.notes.join(" ")).toMatch(/could not be read from the chain/);
  });

  it("keeps the validators' prose, the requester and the image notes out of a public decision", () => {
    const pub = publicDecision(decision) as { criteria: Record<string, unknown>[]; evidence: Record<string, unknown>[] };
    const keys = new Set([...Object.keys(pub), ...pub.criteria.flatMap(Object.keys), ...pub.evidence.flatMap(Object.keys)]);
    for (const hidden of ["rationale", "requested_by", "observations", "limitations", "missing", "declared_capture"]) {
      expect(keys.has(hidden), hidden).toBe(false);
    }
    for (const kept of ["decision_digest", "manifest_digest", "terms_digest", "finding", "basis", "sha256", "scope"]) {
      expect(keys.has(kept), kept).toBe(true);
    }
    expect(JSON.stringify(pub)).not.toContain(decision.requested_by);
  });
});
