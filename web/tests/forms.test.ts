/** The wizard's checks, the draft-to-terms mapping, and the image and text helpers. */
import { describe, expect, it } from "vitest";

import { cleanJpeg, clampBox, fitWithin, imageProblem, isJfif, privacyWarnings, sniff } from "@/lib/images";
import { parseGen } from "@/lib/present";
import { buildTerms, check, checkAll, draftFromTerms, emptyDraft, exactGen, realLocal, type Draft } from "@/lib/terms";
import type { Terms } from "@/lib/types";

import images from "./fixtures/images.json";

const IMAGES = images as { name: string; base64: string; problem: string }[];

const RESPONDENT = "0x993BA6CaE307FEb5400B02083062E874F5Fe6839";
const ME = "0x3F2536fD5c1AD0f1e8ea5591f36D731A6D51d911";

const good = (over: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(), title: "Roof repair before the deadline", propertyRef: "Riverside flat",
  claim: "The roof repairs were finished before the deadline.", respondent: RESPONDENT, heldSum: "2",
  challengeBond: "0.1", acknowledged: true, ...over,
});

describe("the wizard's checks", () => {
  it("passes a complete draft", () => {
    expect(checkAll(good(), ME)).toEqual([]);
  });

  it("refuses contact details in the property nickname", () => {
    expect(check(0, good({ propertyRef: "12 High Street, me@example.com" }))).toContain(
      "Use a nickname for the property, not contact details or a link.");
  });

  it("refuses the claimant as respondent and a non-independent inspector", () => {
    expect(check(3, good({ respondent: ME }), ME)).toContain("The respondent must be a different wallet from yours.");
    expect(check(3, good({ inspector: RESPONDENT }), ME)).toContain("The inspector must be independent of both parties.");
  });

  it("needs an inspector for a criterion that needs independent evidence", () => {
    const d = good({ criteria: [{ text: "The inspector confirms the loft is dry.", needsIndependent: true }] });
    expect(check(3, d, ME)).toContain("A criterion needs independent evidence, so name an inspector.");
  });

  it("keeps money inside the contract's limits", () => {
    expect(check(3, good({ heldSum: "0.001" }), ME)).toContain("The held sum must be 0, or between 0.01 and 1000 GEN.");
    expect(check(3, good({ challengeBond: "500" }), ME)).toContain("The challenge bond must be between 0.01 and 100 GEN.");
    expect(check(3, good({ heldSum: "0" }), ME)).toEqual([]);
  });

  it("takes a deadline given as a day to be the whole day, as the contract does", () => {
    expect(check(1, good({ windowStart: "2026-10-03T09:00", deadline: "2026-10-03" }))).toEqual([]);
    expect(check(1, good({ windowStart: "2026-10-04", deadline: "2026-10-03" }))).toContain("The window start is after the deadline.");
    expect(check(1, good({ windowStart: "2026-10-03T17:01", deadline: "2026-10-03T17:00" }))).toContain(
      "The window start is after the deadline.");
  });

  it("refuses a time with seconds or an offset, and a date that does not exist", () => {
    for (const bad of ["2026-10-03T17:00:00", "2026-10-03T17:00Z", "2026-10-03T17:00+01:00", "3 October"]) {
      expect(check(1, good({ deadline: bad }))).toContain("The deadline must be a date, optionally with a time.");
    }
    for (const unreal of ["2026-02-30", "2026-13-01T09:00", "2026-10-03T24:30"]) {
      expect(realLocal(unreal)).toBe(false);
      expect(check(1, good({ deadline: unreal }))).toContain("The deadline is not a real date and time.");
    }
    expect(realLocal("2028-02-29T23:59")).toBe(true);
  });

  it("holds every line of the agreement to the contract's length", () => {
    expect(check(2, good({ limitations: ["fine", "l".repeat(301)] }))).toContain("Limitation 2 is longer than 300 characters.");
    expect(check(2, good({ limitations: ["l".repeat(300)] }))).toEqual([]);
    expect(check(1, good({ claim: "c".repeat(401) }))).toContain("Keep the claim under 400 characters.");
  });

  it("asks for the acknowledgement last", () => {
    expect(check(4, good({ acknowledged: false }))).toHaveLength(1);
  });

  it("builds exactly the JSON open_case reads", () => {
    const t = buildTerms(good({ followsCase: "3", heldSum: "0.15" }));
    expect(t.held_sum_wei).toBe("150000000000000000");
    expect(t.funder).toBe("RESPONDENT");
    expect(t.follows_case).toBe("KW-0003");
    expect(buildTerms(good({ heldSum: "0" })).funder).toBe("");
  });

  it("round-trips a published version into a draft without losing a single atto", () => {
    const t = { ...buildTerms(good({ heldSum: "0.123456789012345678" })), version: 2, case_id: "KW-0007",
      published_at: "", digest: "", rules: "", claimant: ME, follows_case: "KW-0003" } as unknown as Terms;
    const d = draftFromTerms(t);
    expect(parseGen(d.heldSum)).toBe(123456789012345678n);
    expect(d.followsCase).toBe("3");
    expect(buildTerms(d).held_sum_wei).toBe(t.held_sum_wei);
    expect(exactGen("2000000000000000000")).toBe("2");
  });
});

describe("images", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

  it("reads the real type from the first bytes", () => {
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe1))).toBe("jpeg");
    expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniff(bytes(0x25, 0x50, 0x44, 0x46))).toBe("unknown");
  });

  const unbase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const fixture = (name: string) => unbase64(IMAGES.find((x) => x.name === name)!.base64);

  it("judges every fixture image exactly as the contract does", () => {
    expect(IMAGES.length).toBeGreaterThan(20);
    for (const x of IMAGES) expect(imageProblem(unbase64(x.base64)), x.name).toBe(x.problem);
  });

  it("drops camera data, editor records and comments an encoder added, and nothing else", () => {
    const plain = fixture("a plain JPEG");
    for (const name of ["a JPEG with camera data", "a JPEG with an editor record", "a JPEG with a comment"]) {
      const cleaned = cleanJpeg(fixture(name));
      expect(imageProblem(cleaned), name).toBe("");
      // What is left is the plain file's structure with this file's own scan bytes.
      expect(cleaned.length, name).toBe(plain.length);
    }
    expect(Array.from(cleanJpeg(plain))).toEqual(Array.from(plain));
    const profile = fixture("a JPEG with a colour profile");
    expect(Array.from(cleanJpeg(profile))).toEqual(Array.from(profile));
  });

  it("puts the JFIF header first when an encoder left it out or wrote camera data before it", () => {
    const without = fixture("a JPEG with no JFIF header");
    expect(isJfif(without)).toBe(false);
    const fixed = cleanJpeg(without);
    expect(isJfif(fixed)).toBe(true);
    expect(imageProblem(fixed)).toBe("");
    expect(() => cleanJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow("did not produce a JPEG");
  });

  it("cannot make a broken file acceptable", () => {
    for (const name of ["a JPEG that does not end", "a JPEG too small", "a lossless JPEG", "a JPEG with no frame"]) {
      expect(imageProblem(cleanJpeg(fixture(name))), name).not.toBe("");
    }
  });

  it("keeps redaction boxes inside the image whichever way they were drawn", () => {
    const box = clampBox({ x: 0.9, y: 0.9, w: 0.5, h: -0.2 });
    expect([box.x, box.y]).toEqual([0.9, 0.7]);
    expect(box.w).toBeCloseTo(0.1, 9);
    expect(box.h).toBeCloseTo(0.2, 9);
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("warns about contact details and access codes before filing", () => {
    expect(privacyWarnings("call 07700 900123 or mail a@b.co, key safe code 1234")).toEqual(
      expect.arrayContaining(["an email address", "what looks like a phone number", "something that may be an access code"]));
    expect(privacyWarnings("The slates were replaced.")).toEqual([]);
  });
});

describe("terms the contract would refuse are caught before signing", () => {
  it("holds the challenge window to an hour or more", () => {
    expect(check(3, good({ challengeSeconds: 600 }), ME)).toContain("The challenge window must be between 1 hour and 14 days.");
    expect(check(3, good({ challengeSeconds: 3600 }), ME)).toEqual([]);
    expect(check(3, good({ evidenceSeconds: 600, challengeEvidenceSeconds: 600 }), ME)).toEqual([]);
  });

  it("keeps required evidence to what one party can file alone", () => {
    const tooMany = good({ allowed: ["PHOTO", "VIDEO_FRAME", "TEXT_DOCUMENT"],
      required: [{ type: "PHOTO", min: 3 }, { type: "VIDEO_FRAME", min: 3 }] });
    expect(check(2, tooMany).join(" ")).toContain("one party can file alone");
    const fine = good({ required: [{ type: "PHOTO", min: 3 }, { type: "DOC:INVOICE", min: 2 }] });
    expect(check(2, fine)).toEqual([]);
  });

  it("counts a required document as an image when only pages are allowed", () => {
    const required = [{ type: "PHOTO", min: 3 }, { type: "DOC:INVOICE", min: 3 }];
    // The contract refuses this: with no text documents an invoice is a page, and six images are one too many.
    expect(check(2, good({ allowed: ["PHOTO", "DOCUMENT_PAGE"], required })).join(" ")).toContain("one party can file alone");
    expect(check(2, good({ allowed: ["PHOTO", "DOCUMENT_PAGE", "TEXT_DOCUMENT"], required }))).toEqual([]);
    expect(check(2, good({ allowed: ["PHOTO", "DOCUMENT_PAGE"],
      required: [{ type: "PHOTO", min: 3 }, { type: "DOC:INVOICE", min: 2 }] }))).toEqual([]);
  });
});
