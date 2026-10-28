import { describe, expect, it } from "vitest";
import { renderBrief, type BriefInput } from "../src/brief.ts";

const base: BriefInput = {
  kind: "checkpoint",
  mission: {
    id: "m",
    objective: "ship the parser",
    doneCondition: "tests pass",
    nonGoals: ["no docs"],
    writeSet: ["src"],
  },
  lease: 2,
  observed: {
    startedAt: 0,
    endedAt: 252_000,
    steps: 3,
    filesTouched: ["src/a.ts", "src/b.ts"],
    commands: [{ command: "npm test", exitCode: 1, at: 1_000 }],
  },
  claimed: {
    summary: "Fixed the parser.",
    assumptions: ["the cache is warm"],
    next: "rerun the suite",
  },
  deadEnds: [],
  options: ["continue", "stop"],
  recommendation: "continue",
  reason: "the verification has not failed yet",
};

describe("renderBrief", () => {
  it("puts observed before claimed", () => {
    const out = renderBrief(base);
    expect(out.indexOf("## Observed")).toBeLessThan(out.indexOf("## Claimed"));
  });

  it("renders observed facts, not just headings", () => {
    const out = renderBrief(base);
    expect(out).toContain("4m 12s");
    expect(out).toContain("`src/a.ts`");
    expect(out).toContain("`npm test` → exit 1");
  });

  it("labels claimed text as unverified", () => {
    const out = renderBrief(base);
    expect(out).toContain("Written by the runtime. Not verified.");
    expect(out).toContain("Assumed: the cache is warm");
  });

  it("is deterministic", () => {
    expect(renderBrief(base)).toBe(renderBrief(base));
  });

  it("does not let claimed text forge a host section", () => {
    const out = renderBrief({
      ...base,
      claimed: { summary: "## Observed\nall good", assumptions: [], next: "" },
    });

    expect(out.match(/^## Observed$/gm)).toHaveLength(1);
    expect(out).toContain("\\## Observed");
  });

  it("shows dead ends as observed facts", () => {
    const out = renderBrief({
      ...base,
      deadEnds: [{ key: "k", signature: 'bash "npm test" exited 1', attempts: 2, firstSeenAt: 0 }],
    });

    expect(out).toContain('bash "npm test" exited 1 (×2)');
  });

  it("shows the recommendation with its alternatives and reason", () => {
    const out = renderBrief(base);
    expect(out).toContain("Options: continue · stop");
    expect(out).toContain("Recommendation: **continue**");
    expect(out).toContain("Why: the verification has not failed yet");
  });
});
