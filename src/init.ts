import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface InitOptions {
  writeSet?: string[];
  force?: boolean;
}

export interface InitResult {
  guardsPath: string;
  writeSet: string[];
  wrote: boolean;
  gitignoreUpdated: boolean;
  reason?: string;
}

/** Directories that are almost always the work, if they exist. */
const DIRECTORIES = ["src", "lib", "app", "packages", "test", "tests", "docs", "scripts"];
/** Top-level files a normal change touches, so the guard does not cry wolf. */
const FILES = ["package.json", "README.md", "AGENTS.md", "tsconfig.json"];

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Infers a starting write-set from what is actually on disk. Empty means
 * unrestricted, which is the honest default for a repo we know nothing about.
 */
export async function inferWriteSet(cwd: string): Promise<string[]> {
  const set: string[] = [];
  for (const entry of DIRECTORIES) {
    if (await isDirectory(join(cwd, entry))) set.push(entry);
  }
  for (const entry of FILES) {
    if (await exists(join(cwd, entry))) set.push(entry);
  }
  return set;
}

const GITIGNORE_BLOCK = [
  "# exo: guard config is tracked, everything else is local",
  ".exo/*",
  "!.exo/guards.json",
].join("\n");

async function ensureGitignore(cwd: string): Promise<boolean> {
  const path = join(cwd, ".gitignore");
  const current = (await exists(path)) ? await readFile(path, "utf8") : "";
  if (current.includes(".exo/*")) return false;

  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  const separator = current.length > 0 ? "\n" : "";
  await writeFile(path, `${current}${prefix}${separator}${GITIGNORE_BLOCK}\n`, "utf8");
  return true;
}

export function defaultConfig(writeSet: string[]): string {
  return `${JSON.stringify(
    {
      writeSet,
      cadenceMs: 300_000,
      stepBudget: 60,
      maxRepeatFailures: 2,
      maxRepeatedCalls: 4,
    },
    null,
    2,
  )}\n`;
}

export async function runInit(cwd: string, options: InitOptions = {}): Promise<InitResult> {
  const guardsPath = join(cwd, ".exo", "guards.json");

  if ((await exists(guardsPath)) && !options.force) {
    const existing = JSON.parse(await readFile(guardsPath, "utf8")) as { writeSet?: string[] };
    return {
      guardsPath,
      writeSet: existing.writeSet ?? [],
      wrote: false,
      gitignoreUpdated: false,
      reason: "already exists",
    };
  }

  const writeSet = options.writeSet ?? (await inferWriteSet(cwd));
  await mkdir(join(cwd, ".exo"), { recursive: true });
  await writeFile(guardsPath, defaultConfig(writeSet), "utf8");
  const gitignoreUpdated = await ensureGitignore(cwd);

  return { guardsPath, writeSet, wrote: true, gitignoreUpdated };
}

export function formatInit(result: InitResult, cwd: string): string {
  const relative = result.guardsPath.startsWith(cwd) ? result.guardsPath.slice(cwd.length + 1) : result.guardsPath;

  if (!result.wrote) {
    return [
      `exo init: ${relative} already exists — nothing changed.`,
      `write-set: ${result.writeSet.length > 0 ? result.writeSet.join(", ") : "unrestricted"}`,
      "",
      "Edit it directly, or run `exo init --force` to reset it to the inferred set.",
    ].join("\n");
  }

  const lines = [
    `exo init: wrote ${relative}`,
    `write-set: ${result.writeSet.length > 0 ? result.writeSet.join(", ") : "unrestricted"}`,
  ];
  if (result.writeSet.length === 0) {
    lines.push("  (nothing to infer here — add paths once you know what the work touches)");
  }
  if (result.gitignoreUpdated) lines.push("gitignore: .exo/* ignored, guards.json tracked");
  lines.push("");
  lines.push("Next: run `exo` in this repo and ask for something; `/exo` shows the guards.");
  return lines.join("\n");
}

export function parseInitArgs(args: readonly string[]): InitOptions & { help: boolean } {
  const options: InitOptions & { help: boolean } = { help: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--write-set") {
      const value = args[index + 1];
      if (value === undefined) throw new Error("--write-set needs a value, e.g. --write-set src,test");
      options.writeSet = value.split(",").map((part) => part.trim()).filter(Boolean);
      index += 1;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  return options;
}

export const INIT_HELP = [
  "Usage: exo init [options]",
  "",
  "Writes .exo/guards.json with a starting write-set inferred from this repo,",
  "and makes sure .gitignore tracks the config but not the ledger.",
  "",
  "Options:",
  "  --write-set a,b,c   set the allowed paths explicitly",
  "  --force, -f         overwrite an existing guards.json",
  "  --help, -h          this message",
].join("\n");
