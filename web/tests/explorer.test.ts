/**
 * Finding a case's transactions on the explorer: the walk through its pages
 * is tested here with served pages, so no network is involved. The calldata
 * is real GenVM calldata, encoded with the SDK.
 */
import { abi } from "genlayer-js";
import { describe, expect, it } from "vitest";

import { collectCaseTransactions, decodeCall, outcomeOf, type ExplorerPage, type ExplorerTx } from "@/lib/explorer";

const call = (method: string, args: unknown[]): string => {
  const bytes = abi.calldata.encode(abi.calldata.makeCalldataObject(method, args as never, undefined));
  return btoa(String.fromCharCode(...bytes));
};

let n = 0;
const tx = (method: string, args: unknown[], at: string, over: Partial<ExplorerTx> = {}): ExplorerTx => ({
  hash: `0x${(++n).toString(16).padStart(64, "0")}`, status: "FINALIZED", from_address: "0xabc", created_at: at,
  data: { calldata: call(method, args) }, ...over,
});

const serve = (pages: ExplorerTx[][], total?: number) => {
  const asked: number[] = [];
  const fetchPage = async (page: number): Promise<ExplorerPage> => {
    asked.push(page);
    return { transactions: pages[page - 1] ?? [], pagination: { page, total: total ?? pages.flat().length, totalPages: pages.length } };
  };
  return { fetchPage, asked };
};

describe("reading calldata", () => {
  it("finds the method and its arguments", () => {
    expect(decodeCall(call("readjudicate", ["KW-0003"]))).toEqual({ method: "readjudicate", args: ["KW-0003"] });
  });

  it("answers null for anything that is not a call", () => {
    for (const bad of [undefined, null, "", "not base64 !!", btoa("plain text"), 42]) expect(decodeCall(bad)).toBeNull();
  });
});

describe("the transactions behind a case", () => {
  it("keeps the ones that name the case, whatever the letter case, and nothing else", async () => {
    const { fetchPage } = serve([[
      tx("readjudicate", ["KW-0003"], "2026-10-03T05:15:00Z"),
      tx("request_assessment", ["kw-0003"], "2026-10-03T05:03:00Z"),
      tx("request_assessment", ["KW-0004"], "2026-10-03T05:04:00Z"),
      tx("submit_text", ["KW-0003", "{}", "a document that mentions KW-0004"], "2026-10-03T05:02:00Z"),
      tx("open_case", ["{\"title\":\"about KW-0003\"}"], "2026-10-03T05:00:00Z"),
      { hash: "0xdeploy", created_at: "2026-10-03T04:00:00Z", data: {} },
    ]]);
    const r = await collectCaseTransactions(fetchPage, "KW-0003");
    expect(r.found.map((x) => x.method)).toEqual(["readjudicate", "request_assessment", "submit_text"]);
    expect(r.complete).toBe(true);
    expect(r.scanned).toBe(6);
  });

  it("lists each transaction once even when the explorer serves it again", async () => {
    const again = tx("request_assessment", ["KW-0003"], "2026-10-03T05:03:00Z");
    const { fetchPage } = serve([[again, again], [again, tx("finalize", ["KW-0003"], "2026-10-03T05:01:00Z")]]);
    const r = await collectCaseTransactions(fetchPage, "KW-0003");
    expect(r.found.map((x) => x.method)).toEqual(["request_assessment", "finalize"]);
    expect(r.scanned).toBe(2);
  });

  it("stops at the first page that reaches back before the case was opened", async () => {
    const { fetchPage, asked } = serve([
      [tx("finalize", ["KW-0009"], "2026-10-03T09:00:00Z"), tx("request_assessment", ["KW-0009"], "2026-10-03T08:10:00Z")],
      [tx("mark_ready", ["KW-0009"], "2026-10-03T08:05:00Z"), tx("finalize", ["KW-0003"], "2026-10-03T05:18:00Z")],
      [tx("request_assessment", ["KW-0003"], "2026-10-03T05:03:00Z")],
    ]);
    const r = await collectCaseTransactions(fetchPage, "KW-0009", { since: "2026-10-03T08:00:00Z" });
    expect(asked).toEqual([1, 2]);
    expect(r.found.map((x) => x.method)).toEqual(["finalize", "request_assessment", "mark_ready"]);
    expect(r.complete).toBe(true);
  });

  it("allows a minute between the explorer's clock and the contract's", async () => {
    const { fetchPage } = serve([[tx("accept_case", ["KW-0009", "d"], "2026-10-03T07:59:30Z")]]);
    const r = await collectCaseTransactions(fetchPage, "KW-0009", { since: "2026-10-03T08:00:00Z" });
    expect(r.found).toHaveLength(1);
  });

  it("says when it stopped before covering the case, and never implies the list is whole", async () => {
    const pages = Array.from({ length: 9 }, (_, i) => [tx("mark_ready", ["KW-0001"], `2026-10-03T0${9 - i}:00:00Z`)]);
    const { fetchPage, asked } = serve(pages, 900);
    const r = await collectCaseTransactions(fetchPage, "KW-0001", { since: "2026-10-01T00:00:00Z", maxPages: 3 });
    expect(asked).toEqual([1, 2, 3]);
    expect(r.complete).toBe(false);
    expect(r.scanned).toBe(3);
    expect(r.total).toBe(900);
  });

  it("is complete when the list simply ends", async () => {
    const { fetchPage } = serve([[tx("mark_ready", ["KW-0001"], "2026-10-03T05:00:00Z")], []]);
    const r = await collectCaseTransactions(fetchPage, "KW-0001", { since: "2026-10-01T00:00:00Z" });
    expect(r.complete).toBe(true);
  });

  it("lets an explorer failure through, so the page can say the explorer was not reached", async () => {
    await expect(collectCaseTransactions(async () => { throw new Error("The explorer answered 502."); }, "KW-0001"))
      .rejects.toThrow("502");
  });
});

describe("what a listed transaction did", () => {
  const receipt = (tag: number, text: string, execution: string) => ({
    leader_receipt: [{ mode: "leader", execution_result: execution, result: btoa(String.fromCharCode(tag) + text) }],
  });
  const rounds = (...names: string[]) => ({ consensus_results: names.map((consensus_round) => ({ consensus_round })) });
  const ok = receipt(0, '{"case_id": "KW-0003", "state": "FINAL"}', "SUCCESS");

  it("is recorded when the validators accepted it and the contract executed it", () => {
    expect(outcomeOf({ status: "FINALIZED", consensus_data: ok, consensus_history: rounds("Accepted") }).outcome).toBe("recorded");
    expect(outcomeOf({ status: "ACCEPTED", consensus_data: ok, consensus_history: rounds("Leader Rotation", "Accepted") }).outcome)
      .toBe("recorded");
  });

  it("stays recorded when a protocol appeal against it failed", () => {
    expect(outcomeOf({ status: "FINALIZED", consensus_data: ok, consensus_history: rounds("Accepted", "Validator Appeal Failed") })
      .outcome).toBe("recorded");
  });

  it("is refused when the contract raised, with the contract's own sentence", () => {
    const raised = receipt(1, "[EXPECTED] the decision can still be challenged until 2026-10-03T05:13:14Z", "ERROR");
    expect(outcomeOf({ status: "FINALIZED", consensus_data: raised, consensus_history: rounds("Accepted") })).toEqual({
      outcome: "refused", reason: "the decision can still be challenged until 2026-10-03T05:13:14Z" });
  });

  it("is refused when a payable write returned its refusal", () => {
    const returned = receipt(0, '{"refused": true, "reason": "the terms say the respondent deposits the held sum", "credited_wei": "2"}',
      "SUCCESS");
    expect(outcomeOf({ status: "FINALIZED", consensus_data: returned, consensus_history: rounds("Accepted") })).toEqual({
      outcome: "refused", reason: "the terms say the respondent deposits the held sum" });
  });

  it("is undecided when no majority was reached, though it is stored as finalized with a leader result that reads like success", () => {
    const leaderSaid = receipt(0, '{"case_id": "KW-0001", "decision_id": "D-0001", "overall": "CONFLICTING"}', "SUCCESS");
    expect(outcomeOf({ status: "FINALIZED", consensus_data: leaderSaid,
      consensus_history: rounds("Leader Rotation", "Leader Rotation", "Leader Rotation", "Undetermined") }).outcome).toBe("undecided");
    expect(outcomeOf({ status: "UNDETERMINED", consensus_data: leaderSaid, consensus_history: rounds("Undetermined") }).outcome)
      .toBe("undecided");
  });

  it("is unknown while in flight or when the explorer row carries no rounds", () => {
    expect(outcomeOf({ status: "PROPOSING", consensus_data: ok, consensus_history: rounds() }).outcome).toBe("unknown");
    expect(outcomeOf({ status: "FINALIZED", consensus_data: ok }).outcome).toBe("unknown");
    expect(outcomeOf({ status: "FINALIZED", consensus_history: rounds("Accepted") }).outcome).toBe("unknown");
  });

  it("travels with each transaction found for a case", async () => {
    const refused = receipt(1, "[EXPECTED] both sides may file new evidence until 2026-10-03T05:15:32Z", "ERROR");
    const { fetchPage } = serve([[
      tx("readjudicate", ["KW-0003"], "2026-10-03T05:15:40Z", { consensus_data: ok, consensus_history: rounds("Accepted") }),
      tx("readjudicate", ["KW-0003"], "2026-10-03T05:05:40Z", { consensus_data: refused, consensus_history: rounds("Accepted") }),
    ]]);
    const r = await collectCaseTransactions(fetchPage, "KW-0003");
    expect(r.found.map((x) => x.outcome)).toEqual(["recorded", "refused"]);
    expect(r.found[1]?.reason).toContain("may file new evidence");
  });
});
