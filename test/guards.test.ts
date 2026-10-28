import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import guards from "../src/guards.ts";

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

function harness(cwd = "/tmp/exo-test") {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, (args: string, ctx: unknown) => Promise<void>>();
  const messages: Array<{ customType: string; content: string }> = [];
  const notifications: string[] = [];
  const statuses: string[] = [];
  let aborts = 0;

  const ctx = {
    cwd,
    ui: {
      notify(message: string) {
        notifications.push(message);
      },
      setStatus(_key: string, text: string | undefined) {
        if (text) statuses.push(text);
      },
    },
    abort() {
      aborts += 1;
    },
  };

  const pi = {
    on(name: string, handler: Handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    registerCommand(name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) {
      commands.set(name, options.handler);
    },
    async sendMessage(message: { customType: string; content: string }) {
      messages.push(message);
    },
  };

  guards(pi as unknown as ExtensionAPI);

  const emit = async (name: string, event: Record<string, unknown>) => {
    const results: unknown[] = [];
    for (const handler of handlers.get(name) ?? []) results.push(await handler(event, ctx));
    return results;
  };

  return { emit, commands, messages, notifications, statuses, aborts: () => aborts, ctx };
}

const bashCall = (id: string, command: string) => ({ type: "tool_call", toolCallId: id, toolName: "bash", input: { command } });
const bashEnd = (id: string, ok: boolean) => ({
  type: "tool_execution_end",
  toolCallId: id,
  toolName: "bash",
  isError: !ok,
  result: {},
});

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("prohibitions", () => {
  it("blocks every git write", async () => {
    const h = harness();
    await h.emit("agent_start", { type: "agent_start" });
    const [result] = await h.emit("tool_call", bashCall("1", "git commit -m wip"));
    expect(result).toMatchObject({ block: true });
    expect(h.notifications.join(" ")).toContain("git writes");
  });

  it("leaves git reads alone", async () => {
    const h = harness();
    await h.emit("agent_start", { type: "agent_start" });
    const [result] = await h.emit("tool_call", bashCall("1", "git status"));
    expect(result).toBeUndefined();
  });
});

describe("gates", () => {
  it("blocks a dependency install until it is granted", async () => {
    const h = harness();
    await h.emit("agent_start", { type: "agent_start" });

    const [blocked] = await h.emit("tool_call", bashCall("1", "npm install left-pad"));
    expect(blocked).toMatchObject({ block: true });

    await h.commands.get("exo")!("allow dependencies", h.ctx);
    const [allowed] = await h.emit("tool_call", bashCall("2", "npm install left-pad"));
    expect(allowed).toBeUndefined();
  });
});

describe("budget", () => {
  it("shows the budget before it fires", async () => {
    const h = harness();
    await h.emit("agent_start", { type: "agent_start" });
    expect(h.statuses.at(-1)).toMatch(/^guarded \d+:\d\d\/5:00 · 0\/60$/);
  });

  it("extends the run without lifting the guard", async () => {
    const h = harness();
    await h.emit("agent_start", { type: "agent_start" });
    await h.commands.get("exo")!("extend 2", h.ctx);
    expect(h.notifications.join(" ")).toContain("extended by 2m");
    expect(h.statuses.at(-1)).toMatch(/^guarded \d+:\d\d\/5:00/);
  });
});

describe("dead ends", () => {
  it("stops the run after the same failure twice", async () => {
    const h = harness();
    await h.emit("agent_start", { type: "agent_start" });

    await h.emit("tool_call", bashCall("1", "npm test"));
    await h.emit("tool_execution_end", bashEnd("1", false));
    expect(h.aborts()).toBe(0);

    await h.emit("tool_call", bashCall("2", "npm test"));
    await h.emit("tool_execution_end", bashEnd("2", false));

    expect(h.aborts()).toBe(1);
    expect(h.messages.at(-1)?.content).toContain("failed twice");
  });

  it("does not stop when the tree changes between failures", async () => {
    const h = harness();
    await h.emit("agent_start", { type: "agent_start" });

    await h.emit("tool_call", bashCall("1", "npm test"));
    await h.emit("tool_execution_end", bashEnd("1", false));

    await h.emit("tool_call", { type: "tool_call", toolCallId: "2", toolName: "edit", input: { path: "src/a.ts" } });
    await h.emit("tool_execution_end", { type: "tool_execution_end", toolCallId: "2", toolName: "edit", isError: false, result: {} });

    await h.emit("tool_call", bashCall("3", "npm test"));
    await h.emit("tool_execution_end", bashEnd("3", false));

    expect(h.aborts()).toBe(0);
  });
});

describe("write-set", () => {
  it("blocks edits outside a configured write-set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "exo-guards-"));
    dirs.push(dir);
    await mkdir(join(dir, ".exo"), { recursive: true });
    await writeFile(join(dir, ".exo", "guards.json"), JSON.stringify({ writeSet: ["src"] }));

    const h = harness(dir);
    await h.emit("session_start", { type: "session_start" });
    await h.emit("agent_start", { type: "agent_start" });

    const [outside] = await h.emit("tool_call", {
      type: "tool_call",
      toolCallId: "1",
      toolName: "edit",
      input: { path: "lib/a.ts" },
    });
    expect(outside).toMatchObject({ block: true });

    const [inside] = await h.emit("tool_call", {
      type: "tool_call",
      toolCallId: "2",
      toolName: "edit",
      input: { path: "src/a.ts" },
    });
    expect(inside).toBeUndefined();
  });
});

describe("ledger", () => {
  it("records the stop and the human's next instruction", async () => {
    const h = harness();
    await h.emit("agent_start", { type: "agent_start" });
    await h.emit("tool_call", bashCall("1", "npm test"));
    await h.emit("tool_execution_end", bashEnd("1", false));
    await h.emit("tool_call", bashCall("2", "npm test"));
    await h.emit("tool_execution_end", bashEnd("2", false));

    await h.emit("before_agent_start", { type: "before_agent_start", messageType: "user", prompt: "try the unit test" });
    await h.commands.get("exo")!("ledger", h.ctx);

    expect(h.messages.at(-1)?.content).toContain("try the unit test");
  });
});
