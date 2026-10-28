<p align="center">
  <img src="assets/logo-512.png" alt="exoskeleton: a developer in an exoskeleton suit at a keyboard, inside a circuit ring">
</p>

<h1 align="center">exoskeleton</h1>

<p align="center"><strong>pi, with guards.</strong></p>

`exo` **is** pi — same agent, same interface, same editor, same `/model`, same sessions. One extension is loaded on top: it stops a run that has stopped being useful, blocks the actions you always want to do yourself, and tells you exactly what it saw.

There is no separate app, no mission wizard, no plan approval. If you know pi, you know `exo`.

## Install

exo isn't on npm yet. Pick by what the machine can reach.

**From a checkout** — best if you'll edit exo:

```bash
git clone <repo> ~/dev/exoskeleton
cd ~/dev/exoskeleton
npm install        # installs dependencies and builds dist/
npm link           # puts exo on your PATH
```

If `npm link` wants root, give npm a user-owned prefix first:

```bash
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"
npm link
```

**From a tarball** — no repo access needed on the target machine:

```bash
# on the machine with the checkout
npm pack
# on the work laptop
npm i -g ./exoskeleton-0.0.0.tgz
```

**From git** — needs repository access and dev dependencies:

```bash
npm i -g git+ssh://git@github.com/<you>/exoskeleton.git
```

npm runs the package's `prepare` script, which builds it.

Node 24 or newer is required. Node will not run TypeScript from inside `node_modules`, which is why exo ships compiled JavaScript in `dist/`.

## First run in a repo

```bash
cd <repo>
exo init      # writes .exo/guards.json and the gitignore rules
exo
```

`exo init` infers a starting write-set from what is actually there — `src`, `lib`, `app`, `packages`, `test`, `tests`, `docs`, `scripts`, plus `package.json`, `README.md`, `AGENTS.md`, `tsconfig.json` — and writes it with the default policy. It refuses to overwrite an existing config unless you pass `--force`, and `--write-set a,b` sets the paths explicitly. The config is tracked in git; the ledger is not.

## Credentials

exo runs its own pi, but pi reads `~/.pi/agent` — the same `auth.json` and settings a normal pi install uses. The first `exo` offers pi's login flow; API keys in the environment work too.

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
