import type { Claimed, DeadEnd, HandbackKind, Mission, Observed } from "./domain.ts";

export interface BriefInput {
  kind: HandbackKind;
  mission: Mission;
  lease: number;
  observed: Observed;
  claimed: Claimed;
  deadEnds: readonly DeadEnd[];
  options: readonly string[];
  recommendation: string;
  reason: string;
}

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * Model-authored text must never be able to forge structure: a claimed line
 * that looks like a heading would otherwise read as host-authored fact.
 */
function detachHeadings(text: string): string {
  return text.replace(/^(#{1,6}) /gm, "\\$1 ");
}

/**
 * A brief has two registers. Observed is rendered from the record and is
 * deterministic. Claimed is the runtime's account of itself and is labelled
 * as such, because an opinion shown as a fact stops being a decision.
 */
export function renderBrief(input: BriefInput): string {
  const { observed, claimed } = input;
  const lines: string[] = [];

  lines.push(`# Lease ${input.lease} · ${input.kind}`);
  lines.push("");
  lines.push(`Mission: **${input.mission.objective}**`);
  lines.push("");
  lines.push("## Observed");
  lines.push("");
  lines.push("_Recorded by Exo from the event stream._");
  lines.push("");
  lines.push(`- Duration: ${duration(observed.endedAt - observed.startedAt)}`);
  lines.push(`- Tool calls: ${observed.steps}`);
  lines.push(
    `- Files touched: ${observed.filesTouched.length > 0 ? observed.filesTouched.map((p) => `\`${p}\``).join(", ") : "none"}`,
  );
  if (observed.commands.length > 0) {
    lines.push("- Commands:");
    for (const command of observed.commands) {
      lines.push(`  - \`${command.command}\` → exit ${command.exitCode}`);
    }
  }
  if (input.deadEnds.length > 0) {
    lines.push("- Dead ends:");
    for (const end of input.deadEnds) {
      lines.push(`  - ${end.signature} (×${end.attempts})`);
    }
  }
  lines.push("");

  lines.push("## Claimed");
  lines.push("");
  lines.push("_Written by the runtime. Not verified._");
  lines.push("");
  if (claimed.summary) lines.push(detachHeadings(claimed.summary));
  for (const assumption of claimed.assumptions) lines.push(`- Assumed: ${detachHeadings(assumption)}`);
  if (claimed.next) lines.push(`- Next: ${detachHeadings(claimed.next)}`);
  if (!claimed.summary && claimed.assumptions.length === 0 && !claimed.next) lines.push("_Nothing claimed._");
  lines.push("");

  lines.push("## Decision");
  lines.push("");
  lines.push(`- Options: ${input.options.join(" · ")}`);
  lines.push(`- Recommendation: **${input.recommendation}**`);
  lines.push(`- Why: ${detachHeadings(input.reason)}`);
  lines.push("");

  return lines.join("\n");
}
