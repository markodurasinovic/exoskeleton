import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inferWriteSet, parseInitArgs, runInit } from "../src/init.ts";

const dirs: string[] = [];

async function repo(files: string[] = []): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "exo-init-"));
  dirs.push(dir);
  for (const file of files) {
    const path = join(dir, file);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "{}");
  }
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("inferWriteSet", () => {
  it("picks up the directories that exist", async () => {
    const dir = await repo(["src/a.ts", "test/a.test.ts", "package.json"]);
    expect(await inferWriteSet(dir)).toEqual(["src", "test", "package.json"]);
  });

  it("is empty when there is nothing to infer", async () => {
    const dir = await repo();
    expect(await inferWriteSet(dir)).toEqual([]);
  });
});

describe("runInit", () => {
  it("writes a config with the inferred write-set", async () => {
    const dir = await repo(["src/a.ts"]);
    const result = await runInit(dir);

    expect(result.wrote).toBe(true);
    const config = JSON.parse(await readFile(join(dir, ".exo", "guards.json"), "utf8"));
    expect(config.writeSet).toEqual(["src"]);
    expect(config.cadenceMs).toBe(300_000);
  });

  it("takes an explicit write-set", async () => {
    const dir = await repo();
    const result = await runInit(dir, { writeSet: ["lib", "docs"] });
    expect(result.writeSet).toEqual(["lib", "docs"]);
  });

  it("refuses to overwrite without --force", async () => {
    const dir = await repo(["src/a.ts"]);
    await runInit(dir);
    const before = await readFile(join(dir, ".exo", "guards.json"), "utf8");

    const second = await runInit(dir, { writeSet: ["other"] });
    expect(second.wrote).toBe(false);
    expect(second.reason).toBe("already exists");
    expect(await readFile(join(dir, ".exo", "guards.json"), "utf8")).toBe(before);
  });

  it("overwrites with --force", async () => {
    const dir = await repo(["src/a.ts"]);
    await runInit(dir);
    await runInit(dir, { writeSet: ["other"], force: true });

    const config = JSON.parse(await readFile(join(dir, ".exo", "guards.json"), "utf8"));
    expect(config.writeSet).toEqual(["other"]);
  });

  it("tracks the config and ignores the rest of .exo", async () => {
    const dir = await repo();
    const result = await runInit(dir);

    expect(result.gitignoreUpdated).toBe(true);
    const ignore = await readFile(join(dir, ".gitignore"), "utf8");
    expect(ignore).toContain(".exo/*");
    expect(ignore).toContain("!.exo/guards.json");
  });

  it("does not duplicate the gitignore block", async () => {
    const dir = await repo();
    await runInit(dir);
    await runInit(dir, { force: true });

    const ignore = await readFile(join(dir, ".gitignore"), "utf8");
    expect(ignore.match(/\.exo\/\*/g)).toHaveLength(1);
  });

  it("preserves an existing gitignore", async () => {
    const dir = await repo();
    await writeFile(join(dir, ".gitignore"), "node_modules/\n");
    await runInit(dir);

    const ignore = await readFile(join(dir, ".gitignore"), "utf8");
    expect(ignore.startsWith("node_modules/\n")).toBe(true);
    expect(ignore).toContain(".exo/*");
  });
});

describe("parseInitArgs", () => {
  it("reads a write-set", () => {
    expect(parseInitArgs(["--write-set", "src, test"])).toMatchObject({ writeSet: ["src", "test"] });
  });

  it("reads --force", () => {
    expect(parseInitArgs(["-f"]).force).toBe(true);
  });

  it("rejects an unknown option", () => {
    expect(() => parseInitArgs(["--nope"])).toThrow(/unknown option/);
  });
});
