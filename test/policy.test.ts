import { describe, expect, it } from "vitest";
import { LeaseTracker, defaultPolicy, type Policy } from "../src/policy.ts";

const policy: Policy = { ...defaultPolicy };

const bash = (command: string, ok: boolean, exitCode?: number) => ({
  tool: "bash" as const,
  input: { command },
  ok,
  exitCode,
});

const edit = (path: string) => ({
  tool: "edit" as const,
  input: { path },
  ok: true,
  changedPaths: [path],
});

describe("cadence", () => {
  it("does not fire before the limit", () => {
    const tracker = new LeaseTracker(policy, 0);
    tracker.noteTool(edit("a.ts"), 1_000);
    expect(tracker.check(299_999)).toBeNull();
  });

  it("fires at the limit even while work is progressing", () => {
    const tracker = new LeaseTracker(policy, 0);
    tracker.noteTool(edit("a.ts"), 1_000);
    expect(tracker.check(300_000)).toEqual({ kind: "heartbeat", elapsedMs: 300_000 });
  });
});

describe("dead ends", () => {
  it("records a dead end after the same failure twice with no progress between", () => {
    const tracker = new LeaseTracker(policy, 0);
    tracker.noteTool(bash("npm test", false, 1), 1_000);
    expect(tracker.check(1_000)).toBeNull();

    tracker.noteTool(bash("npm test", false, 1), 2_000);
    const stop = tracker.check(2_000);

    expect(stop?.kind).toBe("dead-end");
    if (stop?.kind === "dead-end") {
      expect(stop.deadEnd.signature).toContain("npm test");
      expect(stop.deadEnd.attempts).toBe(2);
    }
  });

  it("does not merge different failing commands", () => {
    const tracker = new LeaseTracker(policy, 0);
    tracker.noteTool(bash("npm test", false, 1), 1_000);
    tracker.noteTool(bash("npm run lint", false, 1), 2_000);
    expect(tracker.check(2_000)).toBeNull();
  });

  it("lets a failure that follows progress be a new attempt", () => {
    const tracker = new LeaseTracker(policy, 0);
    tracker.noteTool(bash("npm test", false, 1), 1_000);
    tracker.noteTool(edit("a.ts"), 2_000);
    tracker.noteTool(bash("npm test", false, 1), 3_000);
    expect(tracker.check(3_000)).toBeNull();
  });

  it("escalates immediately when a known dead end is retried", () => {
    const known = [{ key: "bash|npm test", signature: 'bash "npm test" exited 1', attempts: 2, firstSeenAt: 0 }];
    const tracker = new LeaseTracker(policy, 0, known);
    tracker.noteTool(bash("npm test", false, 1), 1_000);
    expect(tracker.check(1_000)?.kind).toBe("dead-end");
  });

  it("keeps a known dead end in the record for the next lease", () => {
    const known = [{ key: "bash|npm test", signature: 'bash "npm test" exited 1', attempts: 2, firstSeenAt: 0 }];
    const tracker = new LeaseTracker(policy, 0, known);
    tracker.noteTool(edit("a.ts"), 1_000);
    expect(tracker.deadEnds()).toHaveLength(1);
  });
});

describe("stalling", () => {
  it("stops a run of tool calls that change nothing", () => {
    const tracker = new LeaseTracker({ ...policy, maxCallsWithoutProgress: 3 }, 0);
    tracker.noteTool(bash("ls", true), 1_000);
    tracker.noteTool(bash("ls", true), 2_000);
    tracker.noteTool(bash("ls", true), 3_000);

    const stop = tracker.check(3_000);
    expect(stop?.kind).toBe("dead-end");
    if (stop?.kind === "dead-end") expect(stop.deadEnd.key).toBe("stalled");
  });

  it("resets the stall counter when the tree changes", () => {
    const tracker = new LeaseTracker({ ...policy, maxCallsWithoutProgress: 3 }, 0);
    tracker.noteTool(bash("ls", true), 1_000);
    tracker.noteTool(bash("ls", true), 2_000);
    tracker.noteTool(edit("a.ts"), 3_000);
    tracker.noteTool(bash("ls", true), 4_000);
    expect(tracker.check(4_000)).toBeNull();
  });
});

describe("step budget", () => {
  it("stops at the budget", () => {
    const tracker = new LeaseTracker({ ...policy, stepBudget: 2 }, 0);
    tracker.noteTool(edit("a.ts"), 1_000);
    tracker.noteTool(edit("b.ts"), 2_000);
    expect(tracker.check(2_000)).toEqual({ kind: "step-budget", steps: 2 });
  });
});

describe("observed", () => {
  it("renders facts from the record and nothing else", () => {
    const tracker = new LeaseTracker(policy, 100);
    tracker.noteTool(edit("b.ts"), 200);
    tracker.noteTool(bash("npm test", false, 1), 300);

    expect(tracker.observed(400)).toEqual({
      startedAt: 100,
      endedAt: 400,
      steps: 2,
      filesTouched: ["b.ts"],
      commands: [{ command: "npm test", exitCode: 1, at: 300 }],
    });
  });
});
