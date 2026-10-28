import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The extension is loaded by pi from source, with no build step. If it ever
 * imports pi at runtime, it stops being a file pi can load and becomes a
 * program that has to resolve pi's internals. Types are fine; they are erased.
 */
const FILES = ["src/guards.ts", "src/policy.ts", "src/ledger.ts"];

describe("extension portability", () => {
  for (const file of FILES) {
    it(`${file} only imports pi as a type`, () => {
      const source = readFileSync(file, "utf8");

      const runtimeImports = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"(@earendil-works\/[^"]+)"/gm)];
      expect(runtimeImports.map((match) => match[1])).toEqual([]);

      expect(source).not.toMatch(/require\(["']@earendil-works/);
      expect(source).not.toMatch(/^import\(["']@earendil-works/m);
    });
  }

  it("the launcher does not import pi either", () => {
    const source = readFileSync("src/cli.ts", "utf8");
    expect(source).not.toMatch(/from\s+["']@earendil-works/);
  });
});
