import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePiEntry } from "../src/pi-bin.ts";

describe("resolvePiEntry", () => {
  it("finds the pi that exo depends on", () => {
    const entry = resolvePiEntry();
    expect(entry).toMatch(/pi-coding-agent\/dist\/bundle\/cli\.js$/);
    expect(existsSync(entry)).toBe(true);
  });

  it("resolves inside this repo's node_modules, not from PATH", () => {
    expect(resolvePiEntry()).toContain("node_modules/@earendil-works/pi-coding-agent");
  });
});
