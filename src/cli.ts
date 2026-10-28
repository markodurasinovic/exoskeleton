#!/usr/bin/env node
import { rm } from "node:fs/promises";
import { renderBrief } from "./brief.ts";
import { VirtualClock } from "./clock.ts";
import { isDivergence, type Decision, type DeadEnd, type HandbackKind, type Mission, type Plan } from "./domain.ts";
import { FileJournal } from "./journal.ts";
import { runLease } from "./lease.ts";
import { defaultPolicy } from "./policy.ts";
import { renderPreamble } from "./preamble.ts";
import { ScriptedRuntime, type ScriptStep } from "./scripted.ts";

const mission: Mission = {
  id: "demo",
  objective: "Make the lease tracker stop on a repeated failure",
  doneCondition: "the policy tests pass and a repeated failure stops the lease",
  nonGoals: ["no TUI work", "no pi integration"],
  writeSet: ["src/policy.ts", "test/policy.test.ts"],
};

const plan: Plan = {
  items: [
    {
      id: "p1",
      intent: "Key failures on the command and reset them on progress",
      writeSet: ["src/policy.ts"],
      verification: "npm test -- policy",
      status: "active",
    },
    {
      id: "p2",
      intent: "Cover the dead-end rule",
      writeSet: ["test/policy.test.ts"],
      verification: "npm test",
      status: "pending",
    },
  ],
};

const heartbeatLease: ScriptStep[] = [
  { type: "tool_start", callId: "c1", tool: "read", input: { path: "src/policy.ts" }, afterMs: 2_000 },
  { type: "tool_end", callId: "c1", tool: "read", input: { path: "src/policy.ts" }, ok: true, afterMs: 1_000 },
  {
    type: "claim",
    summary: "Read the tracker. The failure counter is keyed on the command, so retries look like new work.",
    afterMs: 1_000,
  },
  {
    type: "tool_end",
    callId: "c2",
    tool: "edit",
    input: { path: "src/policy.ts" },
    ok: true,
    changedPaths: ["src/policy.ts"],
    afterMs: 3_000,
  },
  {
    type: "tool_end",
    callId: "c3",
    tool: "bash",
    input: { command: "npm test -- policy" },
    ok: true,
    exitCode: 0,
    afterMs: 296_000,
  },
];

const deadEndLease: ScriptStep[] = [
  {
    type: "claim",
    summary: "Clearing the counter on progress. Re-running the failing test to confirm.",
    afterMs: 1_000,
  },
  {
    type: "tool_end",
    callId: "c4",
    tool: "bash",
    input: { command: "npm test -- policy" },
    ok: false,
    exitCode: 1,
    output: "1 failing",
    afterMs: 4_000,
  },
  {
    type: "tool_end",
    callId: "c5",
    tool: "bash",
    input: { command: "npm test -- policy" },
    ok: false,
    exitCode: 1,
    output: "1 failing",
    afterMs: 4_000,
  },
];

const finishLease: ScriptStep[] = [
  {
    type: "tool_end",
    callId: "c6",
    tool: "edit",
    input: { path: "src/policy.ts" },
    ok: true,
    changedPaths: ["src/policy.ts"],
    afterMs: 2_000,
  },
  {
    type: "tool_end",
    callId: "c7",
    tool: "bash",
    input: { command: "npm test" },
    ok: true,
    exitCode: 0,
    afterMs: 5_000,
  },
  {
    type: "claim",
    summary: "Failures now clear on progress, and the known dead end escalates on the first retry.",
    assumptions: ["the demo is not the real runtime"],
    next: "Cover the stall rule in the next item.",
    afterMs: 1_000,
  },
  { type: "end", reason: "finished", afterMs: 500 },
];

interface Choice {
  kind: HandbackKind;
  options: string[];
  recommendation: string;
  reason: string;
  choice: string;
  note?: string;
}

function choose(stop: string): Choice {
  switch (stop) {
    case "heartbeat":
      return {
        kind: "heartbeat",
        options: ["continue", "redirect", "stop"],
        recommendation: "continue",
        reason: "the plan item is still inside its verification and nothing has failed",
        choice: "continue",
      };
    case "dead-end":
      return {
        kind: "escalation",
        options: ["take over", "retry a different approach", "stop"],
        recommendation: "take over",
        reason: "the same command has failed twice without changing the working tree",
        choice: "retry a different approach",
        note: "one attempt through a different verification path",
      };
    case "finished":
      return {
        kind: "checkpoint",
        options: ["accept", "revise"],
        recommendation: "accept",
        reason: "the verification passed and the plan item is complete",
        choice: "accept",
      };
    default:
      return {
        kind: "escalation",
        options: ["take over", "stop"],
        recommendation: "take over",
        reason: "the runtime ended without finishing its plan item",
        choice: "take over",
      };
  }
}

async function demo(): Promise<void> {
  const clock = new VirtualClock(0);
  const runtime = new ScriptedRuntime([heartbeatLease, deadEndLease, finishLease], clock);
  const journal = new FileJournal(".exo/missions/demo");
  // The demo is not a mission: start from an empty journal so its output is readable.
  await rm(journal.path, { force: true });
  const known = new Map<string, DeadEnd>();
  let lastDecision: Decision | undefined;
  let stop = "";

  for (let lease = 1; lease <= 3; lease += 1) {
    const input = {
      mission,
      plan,
      item: plan.items[0]!,
      preamble: "",
      deadEnds: [...known.values()],
      lastDecision,
    };
    input.preamble = renderPreamble(input);

    const result = await runLease(runtime, input, defaultPolicy, clock);
    stop = result.stop.kind;
    const picked = choose(stop);

    for (const end of result.deadEnds) known.set(end.key, end);

    console.log(
      renderBrief({
        kind: picked.kind,
        mission,
        lease,
        observed: result.observed,
        claimed: result.claimed,
        deadEnds: result.deadEnds,
        options: picked.options,
        recommendation: picked.recommendation,
        reason: picked.reason,
      }),
    );
    console.log(`> chose: ${picked.choice}${picked.note ? ` — ${picked.note}` : ""}\n`);

    const decision: Decision = {
      id: `d${lease}`,
      at: result.observed.endedAt,
      missionId: mission.id,
      lease,
      kind: picked.kind,
      options: picked.options,
      recommendation: picked.recommendation,
      reason: picked.reason,
      choice: picked.choice,
      note: picked.note,
      outcome: "unknown",
    };
    await journal.append(decision);
    lastDecision = decision;

    if (stop === "finished") break;
  }

  const decisions = await journal.read();
  const divergences = decisions.filter(isDivergence);
  console.log(`Journal: ${journal.path}`);
  console.log(`${decisions.length} decision(s), ${divergences.length} divergence(s).`);
  if (stop === "finished") console.log("Mission done.");
}

const command = process.argv[2];

if (command === "demo") {
  await demo();
} else {
  console.log("exoskeleton\n\nUsage:\n  exo demo   run a scripted mission and show the briefs");
}
