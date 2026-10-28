import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDivergence, type Decision } from "../src/domain.ts";
import { FileJournal, MemoryJournal } from "../src/journal.ts";

const decision = (overrides: Partial<Decision> = {}): Decision => ({
  id: "d1",
  at: 1_000,
  missionId: "m",
  lease: 1,
  kind: "checkpoint",
  options: ["continue", "stop"],
  recommendation: "continue",
  reason: "nothing failed yet",
  choice: "continue",
  outcome: "unknown",
  ...overrides,
});

describe("journal", () => {
  it("round-trips decisions in order", async () => {
    const journal = new MemoryJournal();
    await journal.append(decision({ id: "d1" }));
    await journal.append(decision({ id: "d2", choice: "stop" }));

    const read = await journal.read();
    expect(read.map((d) => d.id)).toEqual(["d1", "d2"]);
  });

  it("reads an empty journal as empty", async () => {
    expect(await new MemoryJournal().read()).toEqual([]);
  });

  it("writes to disk as append-only JSON lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "exo-journal-"));
    try {
      const journal = new FileJournal(join(dir, "demo"));
      await journal.append(decision({ id: "d1" }));
      await journal.append(decision({ id: "d2" }));

      expect((await journal.read()).map((d) => d.id)).toEqual(["d1", "d2"]);
      expect(journal.path.endsWith("journal.jsonl")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("treats a missing file as empty so a new mission needs no setup", async () => {
    const dir = await mkdtemp(join(tmpdir(), "exo-journal-"));
    try {
      expect(await new FileJournal(join(dir, "never-written")).read()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("divergence", () => {
  it("is the signal worth reviewing", () => {
    expect(isDivergence(decision({ choice: "continue" }))).toBe(false);
    expect(isDivergence(decision({ choice: "stop" }))).toBe(true);
  });
});
