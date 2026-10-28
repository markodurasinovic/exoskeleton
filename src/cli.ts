#!/usr/bin/env node
import { spawn } from "node:child_process";
import { join } from "node:path";
import { resolvePiEntry } from "./pi-bin.ts";

/**
 * exo launches the pi it depends on, with one extension added.
 *
 * The contract is pi's documented CLI: `-e <path>` loads an extension file.
 * Nothing here imports pi's JavaScript, so pi can restructure its internals
 * without breaking exo. The version is exo's own, not the one on PATH.
 */
const extension = join(import.meta.dirname, "guards.ts");

let entry: string;
try {
  entry = resolvePiEntry();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const child = spawn(process.execPath, [entry, "-e", extension, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error: NodeJS.ErrnoException) => {
  console.error(`exo: could not start pi: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
