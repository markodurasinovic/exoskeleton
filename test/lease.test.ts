import { describe, expect, it } from "vitest";
import { VirtualClock } from "../src/clock.ts";
import { runLease } from "../src/lease.ts";
import { defaultPolicy } from "../src/policy.ts";
import type { LeaseInput } from "../src/runtime.ts";
import { ScriptedRuntime, type ScriptStep } from "../src/scripted.ts";

const input: LeaseInput = {
  mission: {
    id: "m",
    objective: "make the loop stop",
    doneCondition: "tests pass",
    nonGoals: [],
    writeSet: ["src"],
  },
  plan: { items: [] },
  item: { id: "p1", intent: "stop on repeats", writeSet: [], verification: "npm test", status: "pending" },
  preamble: "",
  deadEnds: [],
};

describe("runLease", () => {
  it("stops at the cadence limit and abandons the rest of the run", async () => {
    const clock = new VirtualClock(0);
    const script: ScriptStep[] = [
      {
        type: "tool_end",
        callId: "1",
        tool: "bash",
        input: { command: "sleep 600" },
        ok: true,
        afterMs: 301_000,
      },
      { type: "tool_end", callId: "2", tool: "edit", input: { path: "src/a.ts" }, ok: true, afterMs: 1_000 },
    ];
    const result = await runLease(new ScriptedRuntime([script], clock), input, defaultPolicy, clock);

    expect(result.stop.kind).toBe("heartbeat");
    expect(result.observed.steps).toBe(1);
  });

  it("stops on a repeated failure and reports the dead end", async () => {
    const clock = new VirtualClock(0);
    const fail: ScriptStep = {
      type: "tool_end",
      callId: "1",
      tool: "bash",
      input: { command: "npm test" },
      ok: false,
      exitCode: 1,
      afterMs: 1_000,
    };
    const result = await runLease(new ScriptedRuntime([[fail, { ...fail, callId: "2" }]], clock), input, defaultPolicy, clock);

    expect(result.stop.kind).toBe("dead-end");
    if (result.stop.kind === "dead-end") {
      expect(result.stop.deadEnd.signature).toContain("npm test");
    }
    expect(result.deadEnds).toHaveLength(1);
  });

  it("returns observed facts and claimed text separately when the runtime finishes", async () => {
    const clock = new VirtualClock(0);
    const script: ScriptStep[] = [
      {
        type: "tool_end",
        callId: "1",
        tool: "edit",
        input: { path: "src/a.ts" },
        ok: true,
        changedPaths: ["src/a.ts"],
        afterMs: 1_000,
      },
      { type: "claim", summary: "Did the thing.", assumptions: ["nothing broke"], next: "review", afterMs: 500 },
      { type: "end", reason: "finished", afterMs: 500 },
    ];
    const result = await runLease(new ScriptedRuntime([script], clock), input, defaultPolicy, clock);

    expect(result.stop.kind).toBe("finished");
    expect(result.observed.filesTouched).toEqual(["src/a.ts"]);
    expect(result.claimed).toEqual({
      summary: "Did the thing.",
      assumptions: ["nothing broke"],
      next: "review",
    });
    expect(result.observed.steps).toBe(1);
  });

  it("treats a run that ends without an end event as an error", async () => {
    const clock = new VirtualClock(0);
    const result = await runLease(new ScriptedRuntime([[]], clock), input, defaultPolicy, clock);

    expect(result.stop.kind).toBe("error");
    expect(result.observed.steps).toBe(0);
  });
});
