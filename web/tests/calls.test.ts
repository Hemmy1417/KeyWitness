/**
 * Every call the app composes, held to the contract's own signatures. A
 * contract call is an untyped array, so neither the typechecker nor the
 * linter notices an argument short, an argument long, a write nobody is ever
 * offered, or value sent to a method that takes none. The signatures come
 * from the contract source (python scripts/web_fixtures.py writes
 * fixtures/schema.json).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import schema from "./fixtures/schema.json";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const WRITES = schema.writes as Record<string, { params: string[]; payable: boolean }>;
const VIEWS = schema.views as Record<string, string[]>;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

/** The text of every <Act ...> opening tag: from "<Act" to the ">" that closes it, braces and strings respected. */
function actTags(text: string): string[] {
  const tags: string[] = [];
  let from = text.indexOf("<Act ");
  while (from >= 0) {
    let depth = 0;
    let quote = "";
    let end = -1;
    for (let i = from; i < text.length; i++) {
      const ch = text[i]!;
      if (quote) {
        if (ch === quote && text[i - 1] !== "\\") quote = "";
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      // An arrow inside an attribute ("=>") is not the end of the tag.
      else if (ch === ">" && depth === 0) { end = i; break; }
    }
    if (end < 0) throw new Error("an <Act tag never closes");
    tags.push(text.slice(from, end + 1));
    from = text.indexOf("<Act ", end);
  }
  return tags;
}

/** The value of one attribute: a quoted string, or the braces' contents. */
function attribute(tag: string, name: string): string | null {
  const at = tag.search(new RegExp(`\\s${name}=`));
  if (at < 0) return null;
  const start = tag.indexOf("=", at) + 1;
  if (tag[start] === '"') return tag.slice(start, tag.indexOf('"', start + 1) + 1);
  let depth = 0;
  for (let i = start; i < tag.length; i++) {
    if (tag[i] === "{") depth++;
    else if (tag[i] === "}" && --depth === 0) return tag.slice(start + 1, i);
  }
  throw new Error(`the ${name} attribute never closes`);
}

/** How many elements each top-level array literal in an expression has. */
function arrays(expr: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] !== "[") continue;
    let depth = 0;
    let commas = 0;
    let inner = "";
    let j = i;
    for (; j < expr.length; j++) {
      const ch = expr[j]!;
      if ("[({".includes(ch)) depth++;
      else if ("])}".includes(ch) && --depth === 0) break;
      else if (ch === "," && depth === 1) commas++;
      if (j > i) inner += ch;
    }
    out.push(inner.trim() ? commas + 1 : 0);
    i = j;
  }
  return out;
}

interface Composed { file: string; method: string; arity: number; value: boolean }

function composed(): Composed[] {
  const out: Composed[] = [];
  for (const file of [...sources(join(WEB, "components")), ...sources(join(WEB, "app"))]) {
    for (const tag of actTags(readFileSync(file, "utf-8"))) {
      const methods = [...(attribute(tag, "method") ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]!);
      const built = arrays(attribute(tag, "args") ?? attribute(tag, "prepare") ?? "");
      if (methods.length === 0) throw new Error(`${file}: an <Act names no method`);
      if (built.length !== methods.length) throw new Error(`${file}: ${methods.join("/")} builds ${built.length} argument lists`);
      methods.forEach((method, i) => out.push({ file, method, arity: built[i]!, value: attribute(tag, "value") !== null }));
    }
  }
  return out;
}

describe("the calls the app composes", () => {
  const calls = composed();

  it("offers every write the contract has, and no other", () => {
    expect([...new Set(calls.map((c) => c.method))].sort()).toEqual(Object.keys(WRITES).sort());
  });

  it("passes each write exactly the arguments the contract takes", () => {
    for (const c of calls) {
      expect(`${c.method} with ${c.arity}`).toBe(`${c.method} with ${WRITES[c.method]!.params.length}`);
    }
  });

  it("sends value to the payable writes and to nothing else", () => {
    for (const c of calls) expect(`${c.method} value ${c.value}`).toBe(`${c.method} value ${WRITES[c.method]!.payable}`);
    expect(Object.keys(WRITES).filter((m) => WRITES[m]!.payable).sort()).toEqual(["challenge", "fund_case"]);
  });

  it("reads only views the contract has, with the arguments they take", () => {
    const text = readFileSync(join(WEB, "lib", "read.ts"), "utf-8");
    const reads = [...text.matchAll(/"((?:get|list|cases)_\w+)", (\[[^\]]*\])/g)].map((m) => ({ name: m[1]!, arity: arrays(m[2]!)[0]! }));
    expect(reads.length).toBeGreaterThan(10);
    for (const r of reads) expect(`${r.name} with ${r.arity}`).toBe(`${r.name} with ${VIEWS[r.name]?.length}`);
    // Every view is read somewhere, so none is dead weight on the contract.
    expect([...new Set(reads.map((r) => r.name))].sort()).toEqual(Object.keys(VIEWS).sort());
  });
});
