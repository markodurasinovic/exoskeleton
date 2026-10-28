import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultPolicy, type Policy } from "./policy.ts";

export type GuardName =
  | "git"
  | "write-set"
  | "delete"
  | "dependencies"
  | "privilege"
  | "spend"
  | "dead-end"
  | "stalled"
  | "step-budget"
  | "cadence";

export interface LedgerEntry {
  at: number;
  guard: GuardName;
  action: "blocked" | "stopped";
  evidence: string[];
  response?: string;
}

/** What a guard is and what it saw. This is the lesson, not a log line. */
export function formatStop(entry: LedgerEntry): string {
  const lines = [
    `Exo ${entry.action === "stopped" ? "stopped this run" : "blocked an action"}: ${WHY[entry.guard]}`,
    "",
    "Evidence:",
    ...entry.evidence.map((line) => `- ${line}`),
    "",
    "What now:",
    WHY_NOT[entry.guard],
  ];
  return lines.join("\n");
}

const WHY: Record<GuardName, string> = {
  git: "git writes belong to you, not to me",
  "write-set": "that path is outside the write-set for this repo",
  delete: "deleting is a gated action",
  dependencies: "changing dependencies is a gated action",
  privilege: "elevated commands are a gated action",
  spend: "commands that can spend money are gated",
  "dead-end": "the same command failed twice without anything changing in between",
  stalled: "the same tool call was repeated with nothing changing in between",
  "step-budget": "this run used its whole step budget",
  cadence: "this run went past the time limit without handing back control",
};

const WHY_NOT: Record<GuardName, string> = {
  git: "Review the diff and run git yourself. I never commit, add, stash, reset, rebase or push.",
  "write-set": "Narrow the request, or widen the write-set in .exo/guards.json.",
  delete: "Run it yourself, or `/exo allow delete` for this session.",
  dependencies: "Run it yourself, or `/exo allow dependencies` for this session.",
  privilege: "Run it yourself, or `/exo allow privilege` for this session.",
  spend: "Run it yourself, or `/exo allow spend` for this session.",
  "dead-end": "Look at the failing output above, then say what to try instead or fix it yourself.",
  stalled: "Say what is actually blocking, or try something else. Repeating the call will not change the answer.",
  "step-budget": "Pick up from here with a smaller instruction, or continue in a new run.",
  cadence: "Continue if it was going well, or redirect. The clock reset with this stop.",
};

export class Ledger {
  #entries: LedgerEntry[] = [];
  #pending: LedgerEntry | null = null;

  record(entry: LedgerEntry): LedgerEntry {
    this.#entries.push(entry);
    this.#pending = entry;
    return entry;
  }

  /** The human's next instruction, attached to the stop it answers. */
  respond(text: string): void {
    if (!this.#pending) return;
    const trimmed = text.trim();
    if (trimmed.length > 0) this.#pending.response = trimmed;
    this.#pending = null;
  }

  entries(): readonly LedgerEntry[] {
    return this.#entries;
  }

  last(): LedgerEntry | null {
    return this.#entries[this.#entries.length - 1] ?? null;
  }
}

export function formatLedger(entries: readonly LedgerEntry[]): string {
  if (entries.length === 0) return "The ledger is empty: no guard has fired in this session.";

  const lines = [`Ledger · ${entries.length} guard event(s)`];
  for (const entry of entries) {
    const when = new Date(entry.at).toISOString().slice(11, 19);
    lines.push("");
    lines.push(`${when}  ${entry.action.padEnd(8)} ${entry.guard}`);
    for (const line of entry.evidence) lines.push(`        ${line}`);
    if (entry.response) lines.push(`        you: ${entry.response}`);
  }
  return lines.join("\n");
}

export interface GuardConfig {
  writeSet: string[];
  policy: Policy;
}

export async function loadConfig(cwd: string): Promise<GuardConfig> {
  const fallback: GuardConfig = { writeSet: [], policy: { ...defaultPolicy } };
  try {
    const raw = JSON.parse(await readFile(join(cwd, ".exo", "guards.json"), "utf8")) as Record<string, unknown>;
    const writeSet = Array.isArray(raw.writeSet) ? raw.writeSet.filter((entry): entry is string => typeof entry === "string") : [];
    const policy: Policy = {
      cadenceMs: typeof raw.cadenceMs === "number" ? raw.cadenceMs : defaultPolicy.cadenceMs,
      stepBudget: typeof raw.stepBudget === "number" ? raw.stepBudget : defaultPolicy.stepBudget,
      maxRepeatFailures: typeof raw.maxRepeatFailures === "number" ? raw.maxRepeatFailures : defaultPolicy.maxRepeatFailures,
      maxRepeatedCalls:
        typeof raw.maxRepeatedCalls === "number"
          ? raw.maxRepeatedCalls
          : typeof raw.maxCallsWithoutProgress === "number"
            ? raw.maxCallsWithoutProgress
            : defaultPolicy.maxRepeatedCalls,
    };
    return { writeSet, policy };
  } catch {
    return fallback;
  }
}

export async function appendLedger(cwd: string, entry: LedgerEntry): Promise<void> {
  try {
    const dir = join(cwd, ".exo");
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, "ledger.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // the ledger is a convenience; never break a run over it
  }
}
