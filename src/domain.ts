/** The human's declared objective, with a done-condition, non-goals and write-set. */
export interface Mission {
  id: string;
  objective: string;
  doneCondition: string;
  nonGoals: string[];
  /** Paths Exo may modify without a gate. Anything outside is out of scope. */
  writeSet: string[];
}

export type PlanItemStatus = "pending" | "active" | "done" | "abandoned";

/** A unit of the approved plan. The verification line is what makes "done" testable. */
export interface PlanItem {
  id: string;
  intent: string;
  writeSet: string[];
  verification: string;
  status: PlanItemStatus;
}

export interface Plan {
  items: PlanItem[];
}

export interface CommandRecord {
  command: string;
  exitCode: number;
  at: number;
}

/** Facts rendered by the host from the record. Never written by the model. */
export interface Observed {
  startedAt: number;
  endedAt: number;
  steps: number;
  filesTouched: string[];
  commands: CommandRecord[];
}

/** Model-authored rationale. Presented as a claim, never as fact. */
export interface Claimed {
  summary: string;
  assumptions: string[];
  next: string;
}

/** An attempt known not to work. Carried into the next lease so it is not retried. */
export interface DeadEnd {
  /** Stable identity of the attempt. */
  key: string;
  /** Human-readable description of what was tried and how it failed. */
  signature: string;
  attempts: number;
  firstSeenAt: number;
}

export type HandbackKind = "heartbeat" | "checkpoint" | "escalation";

/** What the human chose at a handback. The unit of learning. */
export interface Decision {
  id: string;
  at: number;
  missionId: string;
  lease: number;
  kind: HandbackKind;
  options: string[];
  recommendation: string;
  reason: string;
  choice: string;
  note?: string;
  outcome?: "right" | "wrong" | "unknown";
}

export function isDivergence(decision: Decision): boolean {
  return decision.choice !== decision.recommendation;
}
