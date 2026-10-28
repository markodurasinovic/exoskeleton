# Exo stays on pi's agent and interface

exo runs pi's agent, tools, sessions, and interface, and adds a guard extension. It does not own the loop or the surface. The product is the policy, not the interface: every attempt to build a bespoke surface made the product worse, while the guards and the ledger survived contact. Owning the agent would mean owning context assembly, compaction, sessions, providers, tools, and an interface — the work OpenClaw took on because its product is a daemon with many channels, a shape exo does not have.

**Status**: accepted

**Consequences**: the guard experience is bounded by pi's extension UI — a status line, custom messages in the transcript, and commands. The portable hedge is `src/policy.ts`, which must stay free of pi imports; `test/extension.test.ts` enforces it, so a second surface would need a second adapter rather than a new agent.

## Revisit if

- pi's extension API cannot express a guard interaction we need.
- exo needs a surface other than a terminal session (CI, a web view, a shared team instance).
- pi ships guards of its own and exo has to differentiate on experience rather than policy.

## Considered Options

- **Take pi's rendering only and own the agent** (OpenClaw's shape) — correct for a multi-channel daemon, wrong for a terminal tool whose value is its policy, and it re-incurs the work that was already deleted once.
- **Fork pi** — no limitation justifies it yet; forking in anticipation is how the previous app happened.
