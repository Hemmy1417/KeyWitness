/** No raw value reaches a page: ids, codes, dates and amounts all come out in words. */
import { describe, expect, it } from "vitest";

import {
  caseIdFrom, caseName, cutShort, day, eventText, exhibitName, floorText, gen, local, prose, requirementLabel, seconds, sentence,
  seenThrough, settleText,
  termsTime, txLabel, utc,
} from "@/lib/present";

describe("names and words", () => {
  it("names records the way a person says them", () => {
    expect(caseName("KW-0012")).toBe("Case 12");
    expect(exhibitName("E-0003")).toBe("Exhibit 3");
    expect(caseIdFrom("12")).toBe("KW-0012");
    expect(caseIdFrom("case 7")).toBe("KW-0007");
    expect(caseIdFrom("KW-0003")).toBe("KW-0003");
    expect(caseIdFrom("twelve")).toBe("");
  });

  it("puts machine ids and labels in model prose into words", () => {
    expect(prose("E-0003 shows the roof; C2 is NOT_ESTABLISHED per D-0004.")).toBe(
      "Exhibit 3 shows the roof; Criterion 2 is not established per Decision 4.");
  });

  it("leaves out a fence tag a model repeated, and nothing else", () => {
    expect(prose("The testing limitation (0adca668d4b96000) excludes testing under rain."))
      .toBe("The testing limitation excludes testing under rain.");
    expect(prose("Per limitation 0adca668d4b96000, rain was not tested.")).toBe("Per limitation, rain was not tested.");
    // Shorter and longer runs of hex are somebody's content, not a tag.
    expect(prose("Invoice ref 0adca668 and serial 0adca668d4b96000ff.")).toBe("Invoice ref 0adca668 and serial 0adca668d4b96000ff.");
  });

  it("knows reasoning that was cut at the record's limit from reasoning that ended", () => {
    const whole = "Exhibit 6 reports the ceiling stain is still present, with a moisture reading of 27 percent at its centre.";
    expect(cutShort(whole)).toBe(false);
    expect(cutShort(whole.slice(0, -9))).toBe(true);
    expect(cutShort(`${whole.slice(0, -1)} (see the report)`)).toBe(false);
    expect(cutShort("Too short to judge")).toBe(false);
    expect(cutShort("")).toBe(false);
  });

  it("explains the combined floor by what the decision itself records", () => {
    expect(floorText("F6/F7", true, false)).toContain("tried to instruct the assessor");
    expect(floorText("F6/F7", true, false)).not.toContain("brought from a case");
    expect(floorText("F6/F7", false, true)).toContain("brought from a case with a different other party");
    expect(floorText("F6/F7", false, true)).not.toContain("instruct");
    expect(floorText("F6/F7", true, true)).toContain("The same goes for a file the claimant brought");
    expect(floorText("F3")).toContain("Only the favoured side's own evidence");
    expect(floorText("F99")).toBe("F99");
  });

  it("says so when what would settle a criterion was cut at the record's limit", () => {
    const short = "An independent inspection made after the second visit.";
    expect(settleText(short)).toBe(short);
    const filled = "Independent evidence that chimney flashing was resealed on every face and that the front gutter was cleared, such as a detailed inspection record made after the";
    expect(filled.length).toBe(160);
    expect(settleText(filled)).toBe(`${filled} (cut here: the record holds 160 characters)`);
    // A cut that lands on a space or a comma does not leave it dangling before the note.
    expect(settleText(`${"x".repeat(158)}, `)).toBe(`${"x".repeat(158)} (cut here: the record holds 160 characters)`);
  });

  it("turns contract refusals into sentences with no markers, timestamps or atto", () => {
    expect(sentence("[EXPECTED] the draft stays open until 2026-10-08T09:00:00Z")).toBe(
      "The draft stays open until 8 Oct 2026, 09:00 UTC.");
    expect(sentence("send exactly the held sum, 2000000000000000000 atto")).toBe("Send exactly the held sum, 2 GEN.");
  });

  it("labels requirements and windows in plain words", () => {
    expect(requirementLabel("DOC:WORK_ORDER", 1)).toBe("At least one work order");
    expect(requirementLabel("PHOTO", 2)).toBe("At least 2 photographs");
    expect(seconds(600)).toBe("10 minutes");
    expect(seconds(86400)).toBe("1 day");
    expect(seconds(3 * 86400)).toBe("3 days");
    expect(gen("150000000000000000")).toBe("0.15 GEN");
  });
});

describe("dates, spelled by hand", () => {
  it("never depends on the browser's month abbreviations", () => {
    expect(utc("2026-09-03T14:05:00Z")).toBe("3 Sep 2026, 14:05 UTC");
    expect(local("2026-09-03T14:05:00Z", "Europe/London")).toBe("3 Sep 2026, 15:05 (Europe/London)");
    expect(local("2026-01-01T00:30:00Z", "America/New_York")).toBe("31 Dec 2025, 19:30 (America/New York)");
    expect(day("2026-10-03T23:59:00Z")).toBe("3 Oct 2026");
    expect(termsTime("2026-09-26T17:00", "Europe/London")).toBe("26 September 2026, 17:00 (Europe/London)");
    expect(termsTime("2026-09-26", "UTC")).toBe("26 September 2026, the whole day (UTC)");
    expect(termsTime("2026-09-14", "UTC", "start")).toBe("14 September 2026, from the start of the day (UTC)");
    expect(termsTime("2026-09-26", "UTC", "end")).toBe("26 September 2026, until the end of the day (UTC)");
    expect(termsTime("2026-09-26T17:00", "UTC", "end")).toBe("26 September 2026, 17:00 (UTC)");
    expect(utc("not a date")).toBe("");
  });
});

describe("the case log", () => {
  const e = (kind: string, detail = "") => ({ n: 1, kind, detail, at: "2026-10-03T00:00:00Z", by: "0x" });

  it("reads every event the contract records as a sentence", () => {
    const kinds = ["CASE_OPENED", "TERMS_REVISED", "TERMS_ACCEPTED", "CASE_DECLINED", "CASE_WITHDRAWN", "INSPECTOR_ACCEPTED",
      "HELD_SUM_DEPOSITED", "OPENED_FOR_EVIDENCE", "CASE_EXPIRED", "EVIDENCE_FILED", "READY", "CASE_LAPSED", "ASSESSED",
      "CHALLENGED", "READJUDICATION_INCOMPLETE", "READJUDICATED", "CHALLENGE_CLOSED", "FINALIZED"];
    for (const k of kinds) {
      const text = eventText(e(k), "UTC").text;
      expect(text).not.toMatch(/[A-Z]{2,}_[A-Z]/);
      expect(text).toMatch(/\.$/);
    }
  });

  it("keeps hashes, atto and ids out of the sentences", () => {
    expect(eventText(e("CASE_OPENED", "terms version 1, digest abcdef0123"), "UTC").text).toBe(
      "The claimant opened the case with terms version 1.");
    expect(eventText(e("HELD_SUM_DEPOSITED", "100000000000000000 atto by the respondent"), "UTC").text).toBe(
      "The respondent deposited the held sum of 0.1 GEN.");
    expect(eventText(e("EVIDENCE_FILED", "E-0007 by the inspector"), "UTC").text).toBe("The inspector filed Exhibit 7.");
    const assessed = eventText(e("ASSESSED", "D-0002: not_established"), "UTC");
    expect(assessed).toEqual({ text: "Validators recorded Decision 2.", finding: "NOT_ESTABLISHED" });
  });
});

describe("a transaction on a case", () => {
  it("is described as done only when it was recorded", () => {
    expect(txLabel("finalize", "recorded")).toBe("Case finalized");
    expect(txLabel("finalize", "refused")).toBe("Request to finalize the case: refused by the contract");
    expect(txLabel("request_assessment", "undecided"))
      .toBe("Request to have the case assessed: the validators reached no decision, so nothing was recorded");
    expect(txLabel("fund_case", "unknown")).toBe("Request to deposit the held sum");
  });

  it("never claims an outcome for a method it does not know", () => {
    expect(txLabel("some_new_method", "recorded")).toBe("Request to call some new method, recorded");
    expect(txLabel("some_new_method", "refused")).toBe("Request to call some new method: refused by the contract");
  });
});

describe("an image examined through its copy", () => {
  const d = {
    seen_ids: ["E-0001"],
    evidence: [{ evidence_id: "E-0001", sha256: "aa" }, { evidence_id: "E-0002", sha256: "aa" }, { evidence_id: "E-0003", sha256: "bb" }],
  };
  it("names the copy that was seen, and nothing for an image seen itself or not at all", () => {
    expect(seenThrough(d, "E-0002")).toBe("E-0001");
    expect(seenThrough(d, "E-0001")).toBe("");
    expect(seenThrough(d, "E-0003")).toBe("");
    expect(seenThrough(d, "E-0009")).toBe("");
  });
});
