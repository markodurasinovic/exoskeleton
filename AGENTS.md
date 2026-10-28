# exoskeleton

`exo` is **pi with guards**. pi is the agent and the interface; this repo is the guard extension that runs inside it. There is no separate TUI, no mission machinery, no plan approval. If a change starts to look like an app, it is wrong.

## Commands

```bash
npm install       # installs dependencies and builds dist/
npm run build     # tsc -p tsconfig.build.json -> dist/
npm test          # vitest, 57 tests
npm run typecheck # tsc --noEmit
exo               # develop this repo with the guards active
```

`dist/` is generated and is what the installed `exo` runs. Never edit it. In development `node src/cli.ts` runs the TypeScript directly, and the launcher picks `guards.ts` or `guards.js` to match its own extension.

Node refuses to strip types under `node_modules`, so `bin` points at `dist/cli.js`, not `src/cli.ts`. That is why there is a build step at all.

## Shape

| File | Holds | Must not |
|---|---|---|
| `src/policy.ts` | the rules: `RunTracker`, `gateFor`, `GIT_WRITE`, `withinWriteSet` | know anything about pi |
| `src/guards.ts` | the pi extension: subscribes to events, blocks, aborts, reports | contain a rule that belongs in policy |
| `src/ledger.ts` | the record of guard events and the human's next instruction | drive behaviour |
| `src/cli.ts` | spawning `pi -e <repo>/src/guards.ts` and forwarding argv; `exo init` | import pi's JavaScript |
| `src/init.ts` | writing `.exo/guards.json` and the gitignore block | decide policy at runtime |

The split matters: `policy.ts` is pure and testable without pi; `guards.ts` is the only file that imports the pi API.

## Integration contract

- `exo` spawns **its own** pi — resolved from `node_modules`, never from `PATH` — with `-e <repo>/src/guards.ts`, and forwards arguments and signals. It never imports pi's JavaScript.
- `src/guards.ts` must have a **default export** factory. A named export makes pi refuse to load the file (`Extension does not export a valid factory function`).
- The extension may import pi **as a type only**. `test/extension.test.ts` enforces this; if it fails, the extension has stopped being loadable from source by a pi that has no opinion about our `node_modules`.
- `@earendil-works/pi-coding-agent` is a regular dependency pinned to an exact version. It is the runtime, not just the types.
- Upgrading pi: bump the pin, `npm install`, `npm test`, then `exo --print "say hi"` and `exo` + `/exo`. If `pi --help` no longer lists `-e`, the contract changed.
- `src/pi-bin.ts` below the launcher finds the pinned pi with a `node_modules` walk. `import.meta.resolve` is not used: it is unavailable under some loaders and pi's exports map has no `require` condition.

## Rules of the codebase

- **Every guard rule gets a test in `test/policy.test.ts`.** A rule without a test is a rule that will misfire.
- **Every guard behaviour gets a test in `test/guards.test.ts`**, which drives a fake pi (`harness()` in that file). If you add an event handler, add the test that proves it blocks or aborts.
- **Guards never drive the agent.** They observe, block, and abort. No prompts on the agent's behalf, no rewriting tool calls.
- **Exo never writes git.** That is a prohibition, not a gate: no commit, add, stash, reset, rebase, merge, tag, push. Reading git is fine.
- **A guard that fires must explain itself.** Every stop carries evidence and a "what now" line. If you add a guard and the stop report is vague, the guard is not finished.
- **False positives are worse than false negatives.** A guard that stops useful work gets disabled, and then it protects nothing. Prefer narrow, provable rules.

## Adding a guard

1. Add the rule to `src/policy.ts` and a test to `test/policy.test.ts`.
2. Wire it in `src/guards.ts` (`tool_call` to block, `tool_execution_end` or the timer to stop).
3. Add its evidence in `evidenceFor()` and its prose in `WHY` / `WHY_NOT` in `src/ledger.ts`.
4. Add a row to the guard table in `README.md`.
5. Add a case to `test/guards.test.ts`.

## Where the thinking lives

- `GLOSSARY.md` — the vocabulary. Keep it free of implementation detail.
- `docs/adr/` — decisions. **0008 and 0009 are current**: exo is a guard extension on pi (not an app), and it stays on pi's agent and interface (not just the renderer). 0008 supersedes 0001, 0003, 0005, 0006, 0007. Do not resurrect the app those describe.
- `README.md` — the user-facing contract.

## Current state

Working and verified against the real agent:

- git prohibition, gates (delete / dependencies / privilege / spend), optional write-set
- dead end (same command fails twice with no file change), stall (same call repeated 4×), step budget, cadence
- the budget in pi's status line (`guarded 3:12/5:00 · 41/60`), so a stop is never a surprise
- stop reports with evidence, `/exo`, `/exo extend [minutes]`, `/exo allow <class>`, `/exo ledger`
- `exo init` writing a config with an inferred write-set, without clobbering an existing one
- cadence verified live with `cadenceMs: 12000`; dead end verified live with `false` twice

Known gaps, in the order they are worth fixing:

1. **Grants do not persist.** `/exo allow` is per session; `"grants": []` in `.exo/guards.json` is not read yet.
2. **The write-set only guards `edit` and `write`.** Bash can write with `sed -i`, `>`, `>>`, `mv`, `cp`, `tee`.
3. **A stop aborts mid-tool** rather than at the next tool boundary.

## Gotchas

- `.exo/guards.json` is tracked; `.exo/ledger.jsonl` is gitignored. The first is the repo's safety contract, the second is local history.
- In `--print` mode an aborted run ends with pi's own "This operation was aborted" after the stop report. That is pi, not us.
- `npm test` must stay fast and model-free. Never test against a real provider.
- `LICENSE` is MIT and `THIRD_PARTY_NOTICES.md` carries pi's notice. They are deliberately outside the write-set: if a dependency changes, ask the human to update them.
