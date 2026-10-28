import type { CommandRecord, DeadEnd, Observed } from "./domain.ts";

export interface Policy {
  /** Time-triggered: how long the human may go without a decision point. */
  cadenceMs: number;
  /** Hard cap on tool calls within one lease. */
  stepBudget: number;
  /** Failures of the same attempt, with no progress between them, before it is a dead end. */
  maxRepeatFailures: number;
  /** Tool calls without an observable state change before the lease is treated as stalled. */
  maxCallsWithoutProgress: number;
}

export const defaultPolicy: Policy = {
  cadenceMs: 5 * 60_000,
  stepBudget: 60,
  maxRepeatFailures: 2,
  maxCallsWithoutProgress: 12,
};

export interface ToolOutcome {
  tool: string;
  input: unknown;
  ok: boolean;
  exitCode?: number;
  output?: string;
  changedPaths?: string[];
}

export type StopReason =
  | { kind: "heartbeat"; elapsedMs: number }
  | { kind: "dead-end"; deadEnd: DeadEnd }
  | { kind: "step-budget"; steps: number };

const STALL_KEY = "stalled";

function commandOf(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const command = (input as Record<string, unknown>).command;
  return typeof command === "string" ? command : undefined;
}

function failureKey(outcome: ToolOutcome): string {
  // Deliberately excludes output: a command that keeps failing is the dead end.
  // A change in wording is not progress; a change to the tree is.
  return `${outcome.tool}|${commandOf(outcome.input) ?? "<no command>"}`;
}

function describe(outcome: ToolOutcome): string {
  const command = commandOf(outcome.input);
  const code = outcome.exitCode ?? (outcome.ok ? 0 : 1);
  return command ? `${outcome.tool} "${command}" exited ${code}` : `${outcome.tool} failed`;
}

/**
 * Watches one lease. Cadence and dead ends are independent limits: the first
 * bounds how long the human is left out, the second bounds how long the runtime
 * is left spinning. Neither is delegated to the model.
 */
export class LeaseTracker {
  #policy: Policy;
  #startedAt: number;
  #steps = 0;
  #commands: CommandRecord[] = [];
  #files = new Set<string>();
  /** Everything ever recorded, seeded from earlier leases. */
  #record: Map<string, DeadEnd> = new Map();
  /** Failures since the last observable progress. */
  #consecutive: Map<string, number> = new Map();
  #known: Set<string>;
  #reported: Set<string> = new Set();
  #callsSinceProgress = 0;

  constructor(policy: Policy, startedAt: number, knownDeadEnds: readonly DeadEnd[] = []) {
    this.#policy = policy;
    this.#startedAt = startedAt;
    for (const end of knownDeadEnds) this.#record.set(end.key, end);
    this.#known = new Set(knownDeadEnds.map((end) => end.key));
  }

  noteTool(outcome: ToolOutcome, at: number): void {
    this.#steps += 1;

    for (const path of outcome.changedPaths ?? []) this.#files.add(path);
    if (outcome.tool === "bash") {
      const command = commandOf(outcome.input);
      if (command !== undefined) {
        this.#commands.push({ command, exitCode: outcome.exitCode ?? (outcome.ok ? 0 : 1), at });
      }
    }

    if ((outcome.changedPaths?.length ?? 0) > 0) {
      this.#callsSinceProgress = 0;
      this.#consecutive.clear();
      this.#reported.clear();
      return;
    }

    this.#callsSinceProgress += 1;
    if (outcome.ok) return;

    const key = failureKey(outcome);
    this.#consecutive.set(key, (this.#consecutive.get(key) ?? 0) + 1);
    const prior = this.#record.get(key);
    this.#record.set(key, {
      key,
      signature: prior?.signature ?? describe(outcome),
      attempts: (prior?.attempts ?? 0) + 1,
      firstSeenAt: prior?.firstSeenAt ?? at,
    });
  }

  check(now: number): StopReason | null {
    for (const [key, count] of this.#consecutive) {
      const threshold = this.#known.has(key) ? 1 : this.#policy.maxRepeatFailures;
      if (count < threshold || this.#reported.has(key)) continue;
      this.#reported.add(key);
      const record = this.#record.get(key);
      if (record) return { kind: "dead-end", deadEnd: record };
    }

    if (this.#steps >= this.#policy.stepBudget) {
      return { kind: "step-budget", steps: this.#steps };
    }

    if (now - this.#startedAt >= this.#policy.cadenceMs) {
      return { kind: "heartbeat", elapsedMs: now - this.#startedAt };
    }

    if (this.#callsSinceProgress >= this.#policy.maxCallsWithoutProgress && !this.#reported.has(STALL_KEY)) {
      this.#reported.add(STALL_KEY);
      const prior = this.#record.get(STALL_KEY);
      const deadEnd: DeadEnd = {
        key: STALL_KEY,
        signature: `${this.#callsSinceProgress} tool calls without changing the working tree`,
        attempts: (prior?.attempts ?? 0) + 1,
        firstSeenAt: prior?.firstSeenAt ?? now,
      };
      this.#record.set(STALL_KEY, deadEnd);
      return { kind: "dead-end", deadEnd };
    }

    return null;
  }

  deadEnds(): DeadEnd[] {
    return [...this.#record.values()].filter((end) => end.attempts >= this.#policy.maxRepeatFailures);
  }

  observed(now: number): Observed {
    return {
      startedAt: this.#startedAt,
      endedAt: now,
      steps: this.#steps,
      filesTouched: [...this.#files].sort(),
      commands: [...this.#commands],
    };
  }
}
