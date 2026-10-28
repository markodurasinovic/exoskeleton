import type { LeaseInput } from "./runtime.ts";

/**
 * Everything the runtime is told at the start of a lease. Assembled by the host
 * from the record, not from the runtime's own past prose: recorded facts are
 * the least corruptible input we have.
 */
export function renderPreamble(input: LeaseInput): string {
  const { mission, plan, item, deadEnds, lastDecision } = input;
  const lines: string[] = [];

  lines.push("# Mission");
  lines.push(`Objective: ${mission.objective}`);
  lines.push(`Done when: ${mission.doneCondition}`);
  lines.push(`Not doing: ${mission.nonGoals.length > 0 ? mission.nonGoals.join("; ") : "nothing declared"}`);
  lines.push(`Write-set: ${mission.writeSet.join(", ")}`);
  lines.push("");

  lines.push("## Current plan item");
  lines.push(`${item.id}: ${item.intent}`);
  lines.push(`Write-set delta: ${item.writeSet.length > 0 ? item.writeSet.join(", ") : "none"}`);
  lines.push(`Verification: ${item.verification}`);
  lines.push("");

  const remaining = plan.items.filter((other) => other.status === "pending");
  if (remaining.length > 0) {
    lines.push("## Remaining plan");
    for (const other of remaining) lines.push(`- ${other.id}: ${other.intent}`);
    lines.push("");
  }

  if (deadEnds.length > 0) {
    lines.push("## Dead ends — do not retry");
    for (const end of deadEnds) lines.push(`- ${end.signature} (${end.attempts} attempts)`);
    lines.push("Clear a dead end only when the human says so.");
    lines.push("");
  }

  if (lastDecision) {
    lines.push("## The human's last decision");
    lines.push(`${lastDecision.choice}${lastDecision.note ? ` — "${lastDecision.note}"` : ""}`);
    lines.push("");
  }

  lines.push("## Rules");
  lines.push("- Modify only paths in the write-set. If you need more, stop and ask.");
  lines.push("- Never write to git: no commit, add, stash, checkout, reset, rebase, merge, tag, or push.");
  lines.push("- If a verification has already failed twice, call escalate instead of retrying it.");
  lines.push("- Stop when the verification passes. Do not continue into the next plan item.");

  return lines.join("\n");
}
