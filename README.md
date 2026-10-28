# exoskeleton

pi, with guards.

`exo` **is** pi — same agent, same interface, same editor, same `/model`, same sessions. One extension is loaded on top: it stops a run that has stopped being useful, blocks the actions you always want to do yourself, and tells you exactly what it saw.

There is no separate app, no mission wizard, no plan approval. If you know pi, you know `exo`.

## Requirements

Node 24 or newer. `pi` comes with exo.

`exo` runs **its own** pi — the exact version pinned in `package.json` — with one extension added (`pi -e src/guards.ts`), and passes your arguments through untouched. Your global `pi` is not involved, so upgrading one never changes the other. Model credentials and settings still come from `~/.pi/agent`, the same place pi uses.

```bash
exo
exo --model deepseek/deepseek-flash
exo --print "explain src/policy.ts"
```

Everything pi does still works: `@files`, `--continue`, `--print`, `/model`, `/compact`, extensions, skills.

## What the guards do

| Guard | Fires when | What happens |
|---|---|---|
| **git** | any `git` command that writes — commit, add, stash, reset, rebase, merge, tag, push | always blocked, never liftable |
| **delete** | `rm`, `rmdir`, `unlink` | blocked until `/exo allow delete` |
| **dependencies** | `npm/pnpm/yarn/bun install`, `pip install` | blocked until `/exo allow dependencies` |
| **privilege** | `sudo` | blocked until `/exo allow privilege` |
| **spend** | `terraform`, `kubectl`, `aws`, `gcloud`, `vercel`, `flyctl`, `heroku` | blocked until `/exo allow spend` |
| **write-set** | an edit outside the paths in `.exo/guards.json` | blocked |
| **dead end** | the same command fails twice with no file change in between | run stops |
| **stalled** | the same tool call repeated 4 times in a row | run stops |
| **step budget** | 60 tool calls in one run | run stops |
| **cadence** | 5 minutes without handing back control | run stops |

While a run is working, pi's status line shows the budget before it fires: `guarded 3:12/5:00 · 41/60`. A stop is never a surprise.

A stop is not an error. The run ends, pi's prompt comes back, and a **stop report** lands in the transcript:

```
Exo stopped this run: the same command failed twice without anything changing in between.

Evidence:
- bash "npm test" failed (×2)
- `npm test` → exit 1
- `npm test` → exit 1

What now:
Look at the failing output above, then say what to try instead or fix it yourself.
```

## The ledger

`/exo ledger` shows every guard event in the session and the instruction you gave next. That pairing — what the guard saw, what you decided — is the point. It is the only "learning flow" that doesn't get in the way of working.

`/exo` shows the current policy, the remaining budget, and grants. `/exo allow <class>` lifts a gate for the session. `/exo extend [minutes]` buys more time on the current run — the guard stays, the clock moves.

## Configuration

Optional, at `.exo/guards.json`:

```json
{
  "writeSet": ["src", "test"],
  "cadenceMs": 300000,
  "stepBudget": 60,
  "maxRepeatFailures": 2,
  "maxRepeatedCalls": 4
}
```

No file means no write-set and the defaults above. `.exo/guards.json` is meant to be committed — it is the repo's safety contract. Guard events are appended to `.exo/ledger.jsonl`, which is gitignored.

## Development

```bash
npm test          # 45 tests: guard rules, budget, gate classification, write-set, ledger
npm run typecheck
```

`src/policy.ts` holds the rules (`RunTracker`, `gateFor`, `withinWriteSet`) and knows nothing about pi. `src/guards.ts` is the extension that wires them to pi's events. `src/ledger.ts` is the record and its formatting. `src/cli.ts` is `main(argv, { extensionFactories: [guards] })`.

Design lives in `GLOSSARY.md` and `docs/adr/`.

## Licence

MIT — see `LICENSE`. exo runs pi, which is MIT and © 2025 Mario Zechner; the notice is in `THIRD_PARTY_NOTICES.md`.
