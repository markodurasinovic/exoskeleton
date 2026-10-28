import { describe, expect, it } from "vitest";
import { GIT_WRITE, RunTracker, defaultPolicy, formatBudget, gateFor, withinWriteSet, type Policy } from "../src/policy.ts";

const policy: Policy = { ...defaultPolicy };
const bash = (command: string, ok: boolean) => ({ tool: "bash" as const, input: { command }, ok });
const edit = (path: string) => ({ tool: "edit" as const, input: { path }, ok: true, changedPaths: [path] });

describe("cadence", () => {
  it("fires only at the limit", () => {
    const tracker = new RunTracker(policy, 0);
    tracker.noteTool(edit("a.ts"), 1);
    expect(tracker.check(299_999)).toBeNull();
    expect(tracker.check(300_000)).toEqual({ kind: "cadence", elapsedMs: 300_000 });
  });
});

describe("budget", () => {
  it("reports time left and steps used", () => {
    const tracker = new RunTracker(policy, 0);
    tracker.noteTool(edit("a.ts"), 1);
    expect(tracker.elapsed(60_000)).toBe(60_000);
    expect(tracker.remaining(60_000)).toBe(240_000);
    expect(formatBudget(tracker.remaining(60_000), policy.cadenceMs, tracker.steps, policy.stepBudget)).toBe(
      "4:00/5:00 · 1/60",
    );
  });

  it("extends the deadline instead of lifting the guard", () => {
    const tracker = new RunTracker(policy, 0);
    tracker.extend(120_000);
    expect(tracker.check(300_000)).toBeNull();
    expect(tracker.check(420_000)?.kind).toBe("cadence");
  });

  it("ignores a non-positive extension", () => {
    const tracker = new RunTracker(policy, 0);
    tracker.extend(-5_000);
    expect(tracker.check(300_000)?.kind).toBe("cadence");
  });
});

describe("dead ends", () => {
  it("stops after the same failure twice with no progress", () => {
    const tracker = new RunTracker(policy, 0);
    tracker.noteTool(bash("npm test", false), 1);
    expect(tracker.check(1)).toBeNull();
    tracker.noteTool(bash("npm test", false), 2);
    const stop = tracker.check(2);
    expect(stop?.kind).toBe("dead-end");
    if (stop?.kind === "dead-end") expect(stop.deadEnd.attempts).toBe(2);
  });

  it("does not merge different commands", () => {
    const tracker = new RunTracker(policy, 0);
    tracker.noteTool(bash("npm test", false), 1);
    tracker.noteTool(bash("npm run lint", false), 2);
    expect(tracker.check(2)).toBeNull();
  });

  it("lets a failure after progress be a new attempt", () => {
    const tracker = new RunTracker(policy, 0);
    tracker.noteTool(bash("npm test", false), 1);
    tracker.noteTool(edit("a.ts"), 2);
    tracker.noteTool(bash("npm test", false), 3);
    expect(tracker.check(3)).toBeNull();
  });
});

describe("stalling", () => {
  it("stops a run that repeats the same call", () => {
    const tracker = new RunTracker({ ...policy, maxRepeatedCalls: 3 }, 0);
    tracker.noteTool(bash("ls", true), 1);
    tracker.noteTool(bash("ls", true), 2);
    tracker.noteTool(bash("ls", true), 3);
    expect(tracker.check(3)).toEqual({ kind: "stalled", repeats: 3, signature: 'bash|{"command":"ls"}' });
  });

  it("does not stop a survey of different calls", () => {
    const tracker = new RunTracker({ ...policy, maxRepeatedCalls: 3 }, 0);
    for (const file of ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]) {
      tracker.noteTool({ tool: "read", input: { path: file }, ok: true }, 1);
    }
    expect(tracker.check(10)).toBeNull();
  });

  it("resets the repeat count when the call changes", () => {
    const tracker = new RunTracker({ ...policy, maxRepeatedCalls: 3 }, 0);
    tracker.noteTool(bash("ls", true), 1);
    tracker.noteTool(bash("ls", true), 2);
    tracker.noteTool(bash("pwd", true), 3);
    tracker.noteTool(bash("ls", true), 4);
    expect(tracker.check(4)).toBeNull();
  });

  it("resets the repeat count after a file change", () => {
    const tracker = new RunTracker({ ...policy, maxRepeatedCalls: 3 }, 0);
    tracker.noteTool(bash("ls", true), 1);
    tracker.noteTool(bash("ls", true), 2);
    tracker.noteTool(edit("a.ts"), 3);
    tracker.noteTool(bash("ls", true), 4);
    expect(tracker.check(4)).toBeNull();
  });
});

describe("step budget", () => {
  it("stops at the budget", () => {
    const tracker = new RunTracker({ ...policy, stepBudget: 2 }, 0);
    tracker.noteTool(edit("a.ts"), 1);
    tracker.noteTool(edit("b.ts"), 2);
    expect(tracker.check(2)).toEqual({ kind: "step-budget", steps: 2 });
  });
});

describe("git prohibition", () => {
  for (const command of ["git commit -m x", "git push", "git reset --hard", "npm test && git commit -am wip"]) {
    it(`blocks: ${command}`, () => expect(GIT_WRITE.test(command)).toBe(true));
  }

  for (const command of ["git status", "git diff", "git log --oneline"]) {
    it(`allows: ${command}`, () => expect(GIT_WRITE.test(command)).toBe(false));
  }
});

describe("gate classes", () => {
  it("classifies gated commands", () => {
    expect(gateFor("rm -rf dist")).toBe("delete");
    expect(gateFor("npm install left-pad")).toBe("dependencies");
    expect(gateFor("sudo systemctl restart nginx")).toBe("privilege");
  });

  it("leaves ordinary commands alone", () => {
    expect(gateFor("npm test")).toBeNull();
    expect(gateFor("rg TODO src")).toBeNull();
  });
});

describe("write-set", () => {
  it("is unrestricted when empty", () => {
    expect(withinWriteSet("anything/at/all.ts", [])).toBe(true);
  });

  it("accepts paths inside the set", () => {
    expect(withinWriteSet("src/a.ts", ["src"])).toBe(true);
    expect(withinWriteSet("./src/a.ts", ["src/"])).toBe(true);
  });

  it("rejects siblings with the same prefix", () => {
    expect(withinWriteSet("srcx/a.ts", ["src"])).toBe(false);
  });

  it("handles glob entries", () => {
    expect(withinWriteSet("src/deep/file.ts", ["src/**"])).toBe(true);
  });
});
