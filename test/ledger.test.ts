import { describe, expect, it } from "vitest";
import { Ledger, formatLedger, formatStop } from "../src/ledger.ts";

describe("Ledger", () => {
  it("records a stop and attaches the human's next instruction", () => {
    const ledger = new Ledger();
    ledger.record({ at: 1, guard: "dead-end", action: "stopped", evidence: ['bash "npm test" failed (×2)'] });
    ledger.respond("try the unit test instead");

    expect(ledger.last()?.response).toBe("try the unit test instead");
  });

  it("ignores an empty response", () => {
    const ledger = new Ledger();
    ledger.record({ at: 1, guard: "cadence", action: "stopped", evidence: [] });
    ledger.respond("   ");
    expect(ledger.last()?.response).toBeUndefined();
  });
});

describe("formatStop", () => {
  it("says what fired, what it saw, and what to do", () => {
    const text = formatStop({
      at: 1,
      guard: "dead-end",
      action: "stopped",
      evidence: ['bash "npm test" failed (×2)', "`npm test` → exit 1"],
    });
    expect(text).toContain("same command failed twice");
    expect(text).toContain("`npm test` → exit 1");
    expect(text).toContain("What now");
  });
});

describe("formatLedger", () => {
  it("says so when empty", () => {
    expect(formatLedger([])).toContain("empty");
  });

  it("shows the response next to the stop", () => {
    const text = formatLedger([
      { at: 0, guard: "cadence", action: "stopped", evidence: ["300s"], response: "continue" },
    ]);
    expect(text).toContain("cadence");
    expect(text).toContain("you: continue");
  });
});
