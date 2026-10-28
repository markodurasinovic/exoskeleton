# Exo is a guard extension on pi, not an app

`exo` launches pi's own CLI with one inline extension: `main(argv, { extensionFactories: [guards] })`. The extension watches `tool_call` and `tool_execution_end`, blocks or aborts, and reports what it saw. pi keeps its interface, editor, model switching, and sessions; Exo contributes guards and a ledger.

**Status**: accepted

**Supersedes**: 0001, 0003, 0005, 0006, 0007

## Considered Options

- **Host our own loop on the pi SDK** (ADR-0001) — gives complete control of run boundaries, but it means owning the interface too, and that is how the mission machinery and a second TUI got built. `ExtensionContext.abort()` makes the stop guarantee available from inside pi, so the control was never worth the surface it cost.
- **Our own TUI** — reimplemented the one part of pi that already worked, and was worse at it.
- **A separate launcher that spawns `pi`** — works, but the extension could not be inline and the binary would have to reason about pi's argv, exit codes, and signals.
