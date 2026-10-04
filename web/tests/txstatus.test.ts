/** Protocol statuses come from the network and are never conflated with each other or with findings. */
import { describe, expect, it } from "vitest";

import {
  agreed, appealable, appealWindowEnds, executionOk, finalizedAndRecorded, finalOutcome, flowError, normalizeStatus, outcomeOfStatus,
  protocolStatus, STATUS_TEXT,
  type Lifecycle,
} from "@/lib/txstatus";

const tx = (over: Record<string, unknown> = {}) => ({
  status: "ACCEPTED", result_name: "MAJORITY_AGREE", timestamp_awaiting_finalization: 1_790_000_000,
  num_of_initial_validators: 5,
  consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "SUCCESS" }] },
  consensus_history: { consensus_results: [{ consensus_round: "Accepted" }] },
  ...over,
});
const lc = (over: Partial<Lifecycle> = {}): Lifecycle => ({
  storedStatus: "Accepted", projectedStatus: "Accepted", resolutionAction: "NoOp", resolutionSource: "",
  decisionId: "0xabc", decisionActive: true, evaluatedAt: 0, ...over,
});

describe("stored statuses", () => {
  it("reads both wire spellings of every documented status", () => {
    const names = ["Uninitialized", "Pending", "Proposing", "Committing", "Revealing", "Accepted", "Undetermined",
      "Finalized", "Canceled", "AppealRevealing", "AppealCommitting", "ValidatorsTimeout", "LeaderTimeout", "LeaderRevealing"];
    for (const n of names) {
      const s = normalizeStatus(n);
      expect(s).not.toBe("UNKNOWN");
      expect(normalizeStatus(s)).toBe(s);
      expect(STATUS_TEXT[s].length).toBeGreaterThan(10);
    }
    expect(normalizeStatus("Finalize")).toBe("UNKNOWN");
  });

  it("calls a write finalized and recorded only when final, executed and agreed", () => {
    const s = protocolStatus("0x1", tx({ status: "FINALIZED" }), lc({ storedStatus: "Finalized" }), 30);
    expect(finalizedAndRecorded(s)).toBe(true);
    const refused = protocolStatus("0x1", tx({ status: "FINALIZED",
      consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "ERROR" }] } }), lc({ storedStatus: "Finalized" }), 30);
    expect(executionOk(refused)).toBe(false);
    expect(finalizedAndRecorded(refused)).toBe(false);
    const split = protocolStatus("0x1", tx({ status: "FINALIZED", result_name: "NO_MAJORITY" }), lc({ storedStatus: "Finalized" }), 30);
    expect(agreed(split)).toBe(false);
    expect(finalizedAndRecorded(split)).toBe(false);
    const accepted = protocolStatus("0x1", tx(), lc(), 30);
    expect(finalizedAndRecorded(accepted)).toBe(false);
  });
});

describe("protocol appeals", () => {
  const at = (sec: number) => sec * 1000;

  it("offers a validator appeal on an accepted decision inside its window", () => {
    const s = protocolStatus("0x1", tx(), lc(), 30);
    expect(appealWindowEnds(s)).toBe(at(1_790_000_030));
    expect(appealable(s, at(1_790_000_010))).toMatchObject({ ok: true, kind: "VALIDATOR" });
  });

  it("offers a leader appeal on an undetermined decision", () => {
    const s = protocolStatus("0x1", tx({ status: "UNDETERMINED" }), lc({ storedStatus: "Undetermined" }), 30);
    expect(appealable(s, at(1_790_000_010))).toMatchObject({ ok: true, kind: "LEADER" });
  });

  it("refuses once the protocol says Finalize, after the window, without a decision or without the lifecycle read", () => {
    expect(appealable(protocolStatus("0x1", tx(), lc({ resolutionAction: "Finalize" }), 30), at(1_790_000_010)).ok).toBe(false);
    expect(appealable(protocolStatus("0x1", tx(), lc(), 30), at(1_790_000_100)).ok).toBe(false);
    expect(appealable(protocolStatus("0x1", tx(), lc({ decisionActive: false }), 30), at(1_790_000_010)).ok).toBe(false);
    expect(appealable(protocolStatus("0x1", tx(), null, 30), at(1_790_000_010)).ok).toBe(false);
    expect(appealable(protocolStatus("0x1", tx({ status: "PENDING" }), lc({ storedStatus: "Pending" }), 30), at(1_790_000_010)).ok).toBe(false);
  });

  it("never invents a window the network did not report", () => {
    expect(appealWindowEnds(protocolStatus("0x1", tx(), lc(), null))).toBeNull();
    expect(appealWindowEnds(protocolStatus("0x1", tx({ timestamp_awaiting_finalization: 0 }), lc(), 30))).toBeNull();
  });
});

describe("a failure before the wallet signs", () => {
  it("shows the app's own sentences as they are", () => {
    const own = "The contract would refuse this payout: nothing may be owed to this wallet any more. Nothing was signed.";
    expect(flowError(own)).toEqual({ title: "Nothing was signed", detail: own });
  });

  it("puts what a library raised into the app's words, never on screen as the message", () => {
    const cases: [string, string][] = [
      ["MetaMask Tx Signature: User denied transaction signature.", "You declined it in your wallet"],
      ["user rejected the request (code 4001)", "You declined it in your wallet"],
      ["Missing or invalid parameters. Details: execution failed", "The contract would refuse this"],
      ["GenLayer RPC error (gen_call): Rate limit exceeded: 30 requests per minute", "The network is busy"],
      ["TypeError: fetch failed", "The network did not answer"],
      ["insufficient funds for gas * price + value", "This wallet does not hold enough GEN"],
      ["InsufficientFees()", "The fee deposit was too small"],
    ];
    for (const [raw, title] of cases) {
      const e = flowError(raw);
      expect(e.title).toBe(title);
      expect(e.detail).not.toContain(raw);
      expect(e.title + e.detail).not.toMatch(/[\u2013\u2014]/);
    }
  });

  it("does not take a number inside a longer one for a wallet code or an HTTP status", () => {
    expect(flowError("0x14001abc reverted").title).toBe("This did not go through");
    expect(flowError("request 15023 was odd").title).toBe("This did not go through");
  });

  it("says plainly when it does not recognise the problem, and never claims nothing was sent", () => {
    const e = flowError("Some brand new failure");
    expect(e.title).toBe("This did not go through");
    expect(e.detail).toContain("check the case before trying again");
  });
});

describe("what the network says a transaction did", () => {
  const returned = (json: string) => ({ consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "SUCCESS",
    result: btoa(String.fromCharCode(0) + json) }] } });

  it("is recorded only when agreed and executed without a refusal", () => {
    const t = tx({ status: "FINALIZED", ...returned('{"case_id": "KW-0003", "state": "FINAL"}') });
    expect(outcomeOfStatus(protocolStatus("0x1", t, null, null), t)).toBe("recorded");
  });

  it("reads a payable write's returned refusal", () => {
    const t = tx({ status: "FINALIZED", ...returned('{"refused": true, "reason": "only the claimant challenges it"}') });
    expect(outcomeOfStatus(protocolStatus("0x1", t, null, null), t)).toBe("refused");
  });

  it("never calls a write that refused by returning finalized and recorded", () => {
    const t = tx({ status: "FINALIZED", ...returned('{"refused": true, "reason": "only the claimant challenges it"}') });
    const s = protocolStatus("0x1", t, null, null);
    expect(executionOk(s)).toBe(true);
    expect(s.returnedRefusal).toBe("only the claimant challenges it");
    expect(finalizedAndRecorded(s)).toBe(false);
    expect(finalOutcome(s)).toBe("refused");
    const ok = protocolStatus("0x1", tx({ status: "FINALIZED", ...returned('{"case_id": "KW-0003"}') }), null, null);
    expect(ok.returnedRefusal).toBeNull();
    expect(finalizedAndRecorded(ok)).toBe(true);
    expect(finalOutcome(ok)).toBe("recorded");
  });

  it("calls a finalized round without a majority no majority, whatever the leader's execution did", () => {
    const failed = { consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "ERROR" }] } };
    expect(finalOutcome(protocolStatus("0x1", tx({ status: "FINALIZED", result_name: "NO_MAJORITY", ...failed }), null, null))).toBe("no-majority");
    expect(finalOutcome(protocolStatus("0x1", tx({ status: "FINALIZED", result_name: "MAJORITY_DISAGREE" }), null, null))).toBe("no-majority");
    expect(finalOutcome(protocolStatus("0x1", tx({ status: "FINALIZED", ...failed }), null, null))).toBe("refused");
  });

  it("reads a raised refusal", () => {
    const t = tx({ status: "FINALIZED", consensus_data: { leader_receipt: [{ mode: "leader", execution_result: "ERROR" }] } });
    expect(outcomeOfStatus(protocolStatus("0x1", t, null, null), t)).toBe("refused");
  });

  it("is undecided when the validators did not agree, even once it is stored as finalized", () => {
    const t = tx({ status: "FINALIZED", result_name: "MAJORITY_DISAGREE", ...returned('{"decision_id": "D-0001"}') });
    expect(outcomeOfStatus(protocolStatus("0x1", t, null, null), t)).toBe("undecided");
    const u = tx({ status: "UNDETERMINED", result_name: "NO_MAJORITY" });
    expect(outcomeOfStatus(protocolStatus("0x1", u, null, null), u)).toBe("undecided");
  });

  it("is unknown while in flight", () => {
    const t = tx({ status: "COMMITTING", result_name: "" });
    expect(outcomeOfStatus(protocolStatus("0x1", t, null, null), t)).toBe("unknown");
  });
});
