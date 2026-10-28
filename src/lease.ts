import type { Clock } from "./clock.ts";
import type { Claimed, DeadEnd, Observed } from "./domain.ts";
import { LeaseTracker, type Policy, type StopReason } from "./policy.ts";
import type { LeaseInput, Runtime } from "./runtime.ts";

export type LeaseStop = StopReason | { kind: "finished" } | { kind: "error"; message: string };

export interface LeaseResult {
  stop: LeaseStop;
  observed: Observed;
  claimed: Claimed;
  deadEnds: DeadEnd[];
}

/**
 * Runs one lease: consumes the runtime's events, lets the tracker decide when
 * to stop, and returns the record either way. Stopping is the host's decision,
 * never the runtime's.
 */
export async function runLease(
  runtime: Runtime,
  input: LeaseInput,
  policy: Policy,
  clock: Clock,
): Promise<LeaseResult> {
  const startedAt = clock.now();
  const tracker = new LeaseTracker(policy, startedAt, input.deadEnds);
  let claimed: Claimed = { summary: "", assumptions: [], next: "" };
  let stop: LeaseStop | null = null;

  for await (const event of runtime.run(input)) {
    switch (event.type) {
      case "tool_end":
        tracker.noteTool(event, clock.now());
        break;
      case "claim":
        claimed = {
          summary: event.summary,
          assumptions: event.assumptions ?? [],
          next: event.next ?? "",
        };
        break;
      case "end":
        stop =
          event.reason === "finished"
            ? { kind: "finished" }
            : { kind: "error", message: event.message ?? "runtime error" };
        break;
      case "tool_start":
        break;
    }

    if (!stop) stop = tracker.check(clock.now());
    if (stop) {
      const interrupted = stop.kind !== "finished" && stop.kind !== "error";
      if (interrupted) await runtime.abort();
      break;
    }
  }

  return {
    stop: stop ?? { kind: "error", message: "runtime ended without an end event" },
    observed: tracker.observed(clock.now()),
    claimed,
    deadEnds: tracker.deadEnds(),
  };
}
