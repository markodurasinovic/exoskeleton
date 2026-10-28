# Exo

A guard layer on pi. pi is the agent and the interface; Exo watches it, stops a run that has stopped being useful, and says exactly what it saw.

## Language

### The guard layer

**Exo**:
The guard extension loaded into pi. It has no interface of its own.
_Avoid_: harness, app, TUI

**Guard**:
A check that can block one action or end one run.
_Avoid_: rule, policy, limit

**Prohibition**:
A guard that can never be lifted. Exo never writes git.
_Avoid_: ban, block

**Gate**:
A guard that can be lifted for the session with `/exo allow <class>`.
_Avoid_: permission, approval

**Write-set**:
The paths Exo may edit, when `.exo/guards.json` declares one. Empty means unrestricted.
_Avoid_: scope, sandbox

**Dead end**:
The same command failing twice with nothing changing in between.
_Avoid_: loop, stall

### What the human sees

**Stop**:
The moment a guard ends a run. Control returns to pi's prompt.
_Avoid_: interruption, halt

**Stop report**:
What fired, the evidence for it, and what the human can do next.
_Avoid_: error, notification

**Ledger**:
The record of every guard event and the instruction that followed it.
_Avoid_: log, journal

### The substrate

**pi**:
The agent, its tools, its interface, and its sessions. Exo adds to it and never replaces it.
_Avoid_: runtime, backend
