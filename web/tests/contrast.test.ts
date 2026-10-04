/**
 * Every text colour against every surface it is set on, read from the tokens
 * in app/globals.css and held to WCAG AA for normal text (4.5:1). A new token
 * or a changed value that drops below it fails here, not in a browser.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf-8");
const token = (name: string): string => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6});`).exec(css);
  if (!m?.[1]) throw new Error(`no token --color-${name}`);
  return m[1];
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const PAPER = ["ivory", "folio", "inset"];
const PLATE = ["navy", "navy-2", "navy-3"];
const TINTS = ["supported-tint", "adverse-tint", "uncertain-tint", "neutral-tint"];

const PAIRS: [string, string[]][] = [
  ["ink", [...PAPER, ...TINTS]],
  ["ink-2", [...PAPER, ...TINTS]],
  ["ink-3", [...PAPER, ...TINTS]],
  ["on-navy", PLATE],
  ["on-navy-2", PLATE],
  ["supported", [...PAPER, "supported-tint"]],
  ["adverse", [...PAPER, "adverse-tint"]],
  ["uncertain", [...PAPER, "uncertain-tint"]],
  ["neutral", [...PAPER, "neutral-tint"]],
  ["supported-bright", PLATE],
  ["uncertain-bright", PLATE],
];

describe("text contrast", () => {
  for (const [text, surfaces] of PAIRS) {
    it(`${text} reads at 4.5:1 or better on ${surfaces.join(", ")}`, () => {
      for (const surface of surfaces) {
        const ratio = contrast(token(text), token(surface));
        expect(ratio, `${text} on ${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("gives a light surface inside a navy plate its dark controls back", () => {
    // The wallet menu is ivory paper inside the navy header. Without these rules its buttons kept the header's
    // ivory text: the first thing a visitor has to press, drawn ivory on ivory.
    for (const rule of [".plate .folio .btn { border-color: var(--color-ink); color: var(--color-ink); }",
      ".folio { background: var(--color-folio); border: 1px solid var(--color-rule); color: var(--color-ink); }"]) {
      expect(css).toContain(rule);
    }
    expect(contrast(token("ink"), token("folio"))).toBeGreaterThanOrEqual(4.5);
    const menu = readFileSync(new URL("../components/WalletButton.tsx", import.meta.url), "utf-8");
    expect(menu).toMatch(/role="dialog"[^>]*className="folio /);
  });

  it("keeps the focus ring visible on both the page and a plate", () => {
    // Non-text contrast (3:1) for the amber focus outline.
    expect(contrast(token("uncertain-bright"), token("navy"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("uncertain-bright"), token("ink"))).toBeGreaterThanOrEqual(3);
  });
});
