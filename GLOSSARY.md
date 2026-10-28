# Exo

A coding harness that strengthens an experienced developer by keeping decision authority in their hands. Exo does the typing; the human sets direction, decides at boundaries, and can take the wheel at any moment. It exists to make the developer faster *and* better: the decisions the human makes, and the record of how they turned out, are what the human learns from.

## Language

### Actors

**Exo**:
The application the human runs. It owns direction, pace, and the handbacks to the human.
_Avoid_: agent, assistant, bot

**Runtime**:
The agent loop Exo embeds and supervises. Exo decides when a run starts, pauses, and ends; the runtime only executes turns.
_Avoid_: harness, engine, backend

**Human**:
An experienced developer (mid-level or above) with decision authority over a mission. Never a passive observer, never a rubber stamp, never a student.
_Avoid_: user, operator, junior

### The mission

**Mission**:
The human's declared objective for a session, carrying an explicit done-condition, non-goals, and write-set.
_Avoid_: task, prompt, request, ticket

**Write-set**:
The set of paths Exo may modify without a gate. Anything outside it is out of scope by definition, not by judgement.
_Avoid_: scope, sandbox, target

**Takeover**:
The human pausing the runtime to edit directly. On resume the runtime reconciles every file the human touched before continuing.
_Avoid_: override, intervention, interrupt

### Handbacks

**Handback**:
Any moment where control returns to the human. Every handback is either a heartbeat or a checkpoint.
_Avoid_: approval, review, sync

**Heartbeat**:
A time-triggered handback, offered when the human has gone too long without a decision point. It asks whether the work should continue as planned; it is about pace, not about accepting a change.
_Avoid_: status update, progress bar, ping

**Checkpoint**:
An event-triggered handback, offered at a boundary: a plan ready, a first failure, a diff ready, or a block. It asks whether the work is acceptable and what happens next.
_Avoid_: approval, review, confirmation

**Escalation**:
The runtime's structured declaration that it cannot proceed inside its lease, including what it tried, what failed, and which decision it needs.
_Avoid_: error, failure, report

### Learning

**Decision**:
A choice the human makes at a handback: the options offered, Exo's recommendation and its reason, the human's choice, and its outcome once known.
_Avoid_: answer, response, input

**Divergence**:
A decision where the human's choice differs from Exo's recommendation. The unit of learning.
_Avoid_: override, disagreement, conflict

**Journal**:
The append-only record of decisions and their outcomes. It is the learning artifact; briefs and transcripts are evidence.
_Avoid_: log, history, transcript

**Review**:
The retrospective produced from the journal on request, describing divergences, who turned out right, and recurring patterns.
_Avoid_: report, digest, retro

### Limits

**Lease**:
The bounded stretch of work granted to the runtime between two handbacks. Every lease carries a cadence clock and a step budget.
_Avoid_: run, turn, session

**Gate**:
A block on one class of action that applies regardless of checkpoint, lease, or restricted mode.
_Avoid_: permission, policy, guardrail

**Dead end**:
A recorded attempt known not to work, carried into the next lease so it is not retried.
_Avoid_: failure, blocker, issue

**Unrestricted**:
A human-granted, time-boxed suspension of the cadence clock and step budget. Gates and dead-end detection remain active.
_Avoid_: autopilot, yolo, unattended
