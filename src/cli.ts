#!/usr/bin/env node
import { spawn } from "node:child_process";
import { extname, join } from "node:path";
import { formatInit, INIT_HELP, parseInitArgs, runInit } from "./init.ts";
import { resolvePiEntry } from "./pi-bin.ts";

/**
 * exo launches the pi it depends on, with one extension added.
 *
 * The contract is pi's documented CLI: `-e <path>` loads an extension file.
 * Nothing here imports pi's JavaScript, so pi can restructure its internals
 * without breaking exo. The version is exo's own, not the one on PATH.
 *
 * `exo init` is the one command that is ours rather than pi's.
 */
const extension = join(import.meta.dirname, `guards${extname(import.meta.filename)}`);

function launch(argv: string[]): void {
  let entry: string;
  try {
    entry = resolvePiEntry();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const child = spawn(process.execPath, [entry, "-e", extension, ...argv], {
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
}

const [command, ...rest] = process.argv.slice(2);

if (command === "init") {
  try {
    const options = parseInitArgs(rest);
    if (options.help) {
      console.log(INIT_HELP);
    } else {
      const cwd = process.cwd();
      console.log(formatInit(await runInit(cwd, options), cwd));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} else {
  if (command === "--help" || command === "-h") {
    console.log("exo: pi with guards. `exo init` writes .exo/guards.json; inside pi, /exo shows the guards.\n");
  }
  launch(process.argv.slice(2));
}
