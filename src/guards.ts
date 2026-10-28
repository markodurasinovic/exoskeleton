import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { appendLedger, formatLedger, formatStop, Ledger, loadConfig, type GuardConfig, type GuardName } from "./ledger.ts";
import { formatBudget, gateFor, GIT_WRITE, RunTracker, withinWriteSet, type GateClass, type StopReason } from "./policy.ts";

interface State {
  config: GuardConfig;
  tracker: RunTracker | null;
  inputs: Map<string, Record<string, unknown>>;
  timer: ReturnType<typeof setInterval> | null;
  grants: Set<GateClass>;
  stopped: boolean;
  ctx: ExtensionContext | null;
}

function commandOf(input: Record<string, unknown>): string | undefined {
  return typeof input.command === "string" ? input.command : undefined;
}

function pathOf(input: Record<string, unknown>): string | undefined {
  return typeof input.path === "string" ? input.path : undefined;
}

function evidenceFor(reason: StopReason, tracker: RunTracker | null): string[] {
  const commands = tracker?.recentCommands() ?? [];
  const commandLines = commands.map((entry) => `\`${entry.command}\` → exit ${entry.exitCode}`);

  switch (reason.kind) {
    case "dead-end":
      return [`${reason.deadEnd.signature} (×${reason.deadEnd.attempts})`, ...commandLines];
    case "stalled":
      return [
        `the same call was repeated ${reason.repeats} times in a row`,
        `\`${reason.signature.split("|")[0]}\` with the same input`,
      ];
    case "step-budget":
      return [`${reason.steps} tool calls in this run`, ...commandLines];
    case "cadence":
      return [`${Math.round(reason.elapsedMs / 1000)}s without handing back control`, ...commandLines];
  }
}

function guardOf(reason: StopReason): GuardName {
  return reason.kind;
}

/**
 * The guard layer. It watches pi's own tool stream and either blocks an action
 * or ends the run, then says exactly what it saw. It never drives; pi does.
 */
export default function guards(pi: ExtensionAPI): void {
  const state: State = {
    config: { writeSet: [], policy: { cadenceMs: 300_000, stepBudget: 60, maxRepeatFailures: 2, maxRepeatedCalls: 4 } },
    tracker: null,
    inputs: new Map(),
    timer: null,
    grants: new Set(),
    stopped: false,
    ctx: null,
  };
  const ledger = new Ledger();

  const clearTimer = (): void => {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  };

  /** The budget is shown before it fires, not after. A stop should never surprise. */
  const refreshStatus = (ctx: ExtensionContext): void => {
    const tracker = state.tracker;
    if (!tracker || state.stopped) return;
    const now = Date.now();
    const policy = tracker.policy;
    ctx.ui.setStatus(
      "exo",
      `guarded ${formatBudget(tracker.remaining(now), policy.cadenceMs, tracker.steps, policy.stepBudget)}`,
    );
  };

  const note = (guard: GuardName, action: "blocked" | "stopped", evidence: string[], ctx: ExtensionContext): void => {
    const entry = ledger.record({ at: Date.now(), guard, action, evidence });
    void appendLedger(ctx.cwd, entry);
  };

  const stopRun = async (reason: StopReason, ctx: ExtensionContext): Promise<void> => {
    if (state.stopped) return;
    state.stopped = true;
    clearTimer();

    note(guardOf(reason), "stopped", evidenceFor(reason, state.tracker), ctx);
    const entry = ledger.last();
    if (!entry) return;

    ctx.ui.setStatus("exo", undefined);
    ctx.ui.notify("exo stopped the run", "warning");
    await pi.sendMessage({ customType: "exo-stop", content: formatStop(entry), display: true });
    ctx.abort();
  };

  pi.on("session_start", async (_event, ctx) => {
    state.ctx = ctx;
    state.config = await loadConfig(ctx.cwd);
  });

  pi.on("before_agent_start", (event) => {
    if (event.messageType === "user") ledger.respond(event.prompt);
  });

  pi.on("agent_start", (_event, ctx) => {
    state.ctx = ctx;
    state.stopped = false;
    state.inputs.clear();
    state.tracker = new RunTracker(state.config.policy, Date.now());
    clearTimer();

    state.timer = setInterval(() => {
      const now = Date.now();
      const reason = state.tracker?.check(now);
      if (reason) {
        void stopRun(reason, state.ctx ?? ctx);
        return;
      }
      refreshStatus(state.ctx ?? ctx);
    }, 1_000);
    state.timer.unref?.();
    refreshStatus(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => {
    clearTimer();
    ctx.ui.setStatus("exo", undefined);
  });

  pi.on("tool_call", (event, ctx) => {
    state.ctx = ctx;
    const input = (event.input ?? {}) as Record<string, unknown>;
    state.inputs.set(event.toolCallId, input);

    const blocked = (guard: GuardName, evidence: string[], reason: string): { block: true; reason: string } => {
      note(guard, "blocked", evidence, ctx);
      const entry = ledger.last();
      if (entry) ctx.ui.notify(formatStop(entry).split("\n")[0]!, "warning");
      return { block: true, reason };
    };

    if (event.toolName === "bash") {
      const command = commandOf(input) ?? "";

      if (GIT_WRITE.test(command)) {
        return blocked(
          "git",
          [`\`${command}\``],
          "Exo: git writes are never allowed. Leave the change in the working tree and tell a human to run it.",
        );
      }

      const gate = gateFor(command);
      if (gate && !state.grants.has(gate)) {
        return blocked(
          gate,
          [`\`${command}\``],
          `Exo: ${gate} is gated. Stop and tell the human what you need; they can run it or \`/exo allow ${gate}\`.`,
        );
      }

      return undefined;
    }

    if (event.toolName === "edit" || event.toolName === "write") {
      const path = pathOf(input);
      if (path && !withinWriteSet(path, state.config.writeSet)) {
        return blocked(
          "write-set",
          [`\`${path}\``, `allowed: ${state.config.writeSet.join(", ")}`],
          `Exo: ${path} is outside the write-set (${state.config.writeSet.join(", ")}). Stop and ask for it to be widened.`,
        );
      }
    }

    return undefined;
  });

  pi.on("tool_execution_end", (event, ctx) => {
    state.ctx = ctx;
    const input = state.inputs.get(event.toolCallId) ?? {};
    state.inputs.delete(event.toolCallId);
    if (!state.tracker) return;

    const changed =
      !event.isError && (event.toolName === "edit" || event.toolName === "write") && pathOf(input)
        ? [pathOf(input)!]
        : [];

    state.tracker.noteTool({ tool: event.toolName, input, ok: !event.isError, changedPaths: changed }, Date.now());

    refreshStatus(ctx);
    const reason = state.tracker.check(Date.now());
    if (reason) void stopRun(reason, ctx);
  });

  pi.registerCommand("exo", {
    description: "Guard status, grants, and the ledger",
    handler: async (args, ctx) => {
      const [sub, value] = args.trim().split(/\s+/);

      if (sub === "allow") {
        const gate = value as GateClass;
        if (!gate || !["delete", "dependencies", "privilege", "spend"].includes(gate)) {
          ctx.ui.notify("usage: /exo allow <delete|dependencies|privilege|spend>", "warning");
          return;
        }
        state.grants.add(gate);
        ctx.ui.notify(`${gate}: allowed for this session`, "info");
        return;
      }

      if (sub === "extend") {
        if (!state.tracker) {
          ctx.ui.notify("exo: no run in progress", "warning");
          return;
        }
        const minutes = Number.parseInt(value ?? "", 10);
        const ms = (Number.isFinite(minutes) && minutes > 0 ? minutes : 5) * 60_000;
        state.tracker.extend(ms);
        refreshStatus(ctx);
        ctx.ui.notify(`exo: extended by ${Math.round(ms / 60_000)}m`, "info");
        return;
      }

      if (sub === "ledger") {
        await pi.sendMessage({ customType: "exo-ledger", content: formatLedger(ledger.entries()), display: true });
        return;
      }

      const grants = [...state.grants];
      const writeSet = state.config.writeSet;
      const tracker = state.tracker;
      const lines = [
        "Exo guards",
        ...(tracker
          ? [`- remaining: ${formatBudget(tracker.remaining(Date.now()), tracker.policy.cadenceMs, tracker.steps, tracker.policy.stepBudget)}`]
          : []),
        `- cadence: ${Math.round(state.config.policy.cadenceMs / 60_000)}m`,
        `- step budget: ${state.config.policy.stepBudget} tool calls`,
        `- dead end: ${state.config.policy.maxRepeatFailures} identical failures with no progress`,
        `- write-set: ${writeSet.length > 0 ? writeSet.join(", ") : "unrestricted"}`,
        `- grants: ${grants.length > 0 ? grants.join(", ") : "none"}`,
        "",
        "Commands: /exo ledger · /exo extend [minutes] · /exo allow <class> · edit .exo/guards.json for the write-set",
      ];
      await pi.sendMessage({ customType: "exo-status", content: lines.join("\n"), display: true });
    },
  });
}
