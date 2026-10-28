# Host Exo on the pi SDK

Exo is its own application that embeds pi as a runtime library, rather than a pi extension, a pi fork, or a greenfield agent loop. Exo's promise is that a run cannot continue unattended past the human's tolerance, and only the process that starts and aborts runs can guarantee that; an extension can block a tool call but cannot end a run, a fork costs maintenance for no extra control, and a greenfield loop spends months re-earning plumbing before testing the one idea that matters.

**Status**: superseded by ADR-0008

## Considered Options

- **Extension on pi** — lowest cost, but Exo inherits pi's prompt-in/run-to-completion shape and cannot enforce run boundaries.
- **Fork of pi** — only justified if the transcript or session model must change, or if a running tool must be interrupted in a way `abortSignal` cannot express.
- **Greenfield on model APIs** — maximum control, but rebuilds sessions, compaction, providers, tools, and TUI first.
