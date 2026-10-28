import type { Decision, DeadEnd, Mission, Plan, PlanItem } from "./domain.ts";

/** What the runtime is told before a lease begins. */
export interface LeaseInput {
  mission: Mission;
  plan: Plan;
  item: PlanItem;
  preamble: string;
  deadEnds: DeadEnd[];
  lastDecision?: Decision;
}

/**
 * The only surface Exo has onto a working agent. Everything in the policy layer
 * is expressed against this, so the runtime can be scripted in tests and swapped
 * for a real agent without touching the contract.
 */
export type RuntimeEvent =
  | { type: "tool_start"; callId: string; tool: string; input: Record<string, unknown> }
  | {
      type: "tool_end";
      callId: string;
      tool: string;
      input: Record<string, unknown>;
      ok: boolean;
      exitCode?: number;
      output?: string;
      changedPaths?: string[];
    }
  | { type: "claim"; summary: string; assumptions?: string[]; next?: string }
  | { type: "end"; reason: "finished" | "error"; message?: string };

export interface Runtime {
  readonly name: string;
  run(input: LeaseInput): AsyncIterable<RuntimeEvent>;
  /** Stop the current lease. Must be safe to call when nothing is running. */
  abort(): Promise<void>;
}
