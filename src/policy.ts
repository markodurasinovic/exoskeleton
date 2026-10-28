/** A guard that fired. */
export interface DeadEnd {
  key: string;
  signature: string;
  attempts: number;
  firstSeenAt: number;
}

export interface Policy {
  /** How long a run may go before the human is handed back control. */
  cadenceMs: number;
  /** Tool calls allowed in one run. */
  stepBudget: number;
  /** Failures of the same command, with no progress between, before it is a dead end. */
  maxRepeatFailures: number;
  /** The same tool call repeated this many times in a row before the run counts as stalled. */
  maxRepeatedCalls: number;
}

export const defaultPolicy: Policy = {
  cadenceMs: 5 * 60_000,
  stepBudget: 60,
  maxRepeatFailures: 2,
  maxRepeatedCalls: 4,
};

export interface ToolOutcome {
  tool: string;
  input: Record<string, unknown>;
  ok: boolean;
  changedPaths?: string[];
}

export interface CommandRecord {
  command: string;
  exitCode: number;
}

export type StopReason =
  | { kind: "cadence"; elapsedMs: number }
  | { kind: "dead-end"; deadEnd: DeadEnd }
  | { kind: "stalled"; repeats: number; signature: string }
  | { kind: "step-budget"; steps: number };

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
}

function commandOf(input: Record<string, unknown>): string | undefined {
  return typeof input.command === "string" ? input.command : undefined;
}

function failureKey(outcome: ToolOutcome): string {
  return `${outcome.tool}|${commandOf(outcome.input) ?? "<no command>"}`;
}

function describe(outcome: ToolOutcome): string {
  const command = commandOf(outcome.input);
  if (command) return `${outcome.tool} "${command}" failed`;
  return `${outcome.tool} failed`;
}

/**
 * Watches one run. Cadence and dead ends are independent limits: the first
 * bounds how long the human is left out, the second bounds how long the agent
 * is left spinning. Neither is delegated to the model.
 */
export class RunTracker {
  #policy: Policy;
  #startedAt: number;
  /** When the cadence guard fires. `/exo extend` moves it. */
  #deadline: number;
  #steps = 0;
  #commands: CommandRecord[] = [];
  #files = new Set<string>();
  #record = new Map<string, DeadEnd>();
  #consecutive = new Map<string, number>();
  #reported = new Set<string>();
  /** Identical calls in a row. A survey is not a loop; a repeat is. */
  #lastCall: string | null = null;
  #repeats = 0;

  constructor(policy: Policy, startedAt: number) {
    this.#policy = policy;
    this.#startedAt = startedAt;
    this.#deadline = startedAt + policy.cadenceMs;
  }

  get policy(): Policy {
    return this.#policy;
  }

  elapsed(now: number): number {
    return Math.max(0, now - this.#startedAt);
  }

  remaining(now: number): number {
    return Math.max(0, this.#deadline - now);
  }

  /** More time, without lifting the guard. */
  extend(ms: number): void {
    this.#deadline += Math.max(0, ms);
  }

  get steps(): number {
    return this.#steps;
  }

  noteTool(outcome: ToolOutcome, at: number): void {
    this.#steps += 1;

    for (const path of outcome.changedPaths ?? []) this.#files.add(path);
    const command = commandOf(outcome.input);
    if (outcome.tool === "bash" && command) {
      this.#commands.push({ command, exitCode: outcome.ok ? 0 : 1 });
      if (this.#commands.length > 8) this.#commands.shift();
    }

    const call = `${outcome.tool}|${stable(outcome.input)}`;
    if (call === this.#lastCall) this.#repeats += 1;
    else {
      this.#lastCall = call;
      this.#repeats = 1;
    }

    if ((outcome.changedPaths?.length ?? 0) > 0) {
      this.#repeats = 1;
      this.#consecutive.clear();
      this.#reported.clear();
      return;
    }

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
      if (count < this.#policy.maxRepeatFailures || this.#reported.has(key)) continue;
      this.#reported.add(key);
      const record = this.#record.get(key);
      if (record) return { kind: "dead-end", deadEnd: record };
    }

    if (this.#steps >= this.#policy.stepBudget) {
      return { kind: "step-budget", steps: this.#steps };
    }

    if (this.#repeats >= this.#policy.maxRepeatedCalls && this.#lastCall !== null) {
      const signature = this.#lastCall;
      if (!this.#reported.has(signature)) {
        this.#reported.add(signature);
        return { kind: "stalled", repeats: this.#repeats, signature };
      }
    }

    if (now >= this.#deadline) {
      return { kind: "cadence", elapsedMs: now - this.#startedAt };
    }

    return null;
  }

  recentCommands(limit = 5): CommandRecord[] {
    return this.#commands.slice(-limit);
  }

  filesTouched(): string[] {
    return [...this.#files];
  }
}

/** `4:12/5:00 · 12/60` — remaining and total, then steps and budget. */
export function formatBudget(remainingMs: number, cadenceMs: number, steps: number, stepBudget: number): string {
  const time = (ms: number): string => {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };
  return `${time(remainingMs)}/${time(cadenceMs)} · ${steps}/${stepBudget}`;
}

// -- gates ------------------------------------------------------------------

export type GateClass = "delete" | "dependencies" | "privilege" | "spend";

export const GIT_WRITE =
  /(^|[;&|]\s*)git\s+(commit|push|add|stash|checkout|restore|reset|rebase|merge|tag|branch\s+(-d|-D)|clean|rm|mv)\b/;

const DELETE = /(^|[;&|]\s*)(rm|rmdir|unlink)\b/;
const DEPENDENCIES = /(^|[;&|]\s*)(npm|pnpm|yarn|bun)\s+(i|install|add|remove|uninstall|update)\b|pip3?\s+install\b/;
const PRIVILEGE = /(^|[;&|]\s*)sudo\b/;
const SPEND = /(^|[;&|]\s*)(terraform|kubectl|gcloud|aws|vercel|flyctl|heroku)\b/;

export function gateFor(command: string): GateClass | null {
  if (DELETE.test(command)) return "delete";
  if (DEPENDENCIES.test(command)) return "dependencies";
  if (PRIVILEGE.test(command)) return "privilege";
  if (SPEND.test(command)) return "spend";
  return null;
}

export function withinWriteSet(path: string, writeSet: readonly string[]): boolean {
  if (writeSet.length === 0) return true;
  const target = path.replace(/^\.\//, "");
  return writeSet.some((entry) => {
    const base = entry.replace(/^\.\//, "").replace(/\/\*\*$/, "").replace(/\/+$/, "");
    return target === base || target.startsWith(`${base}/`);
  });
}
