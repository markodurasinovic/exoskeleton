# The human can take over mid-lease

At any moment the human may pause the runtime and edit files directly; on resume Exo re-reads every changed file and reports the changes before continuing. A harness that only accepts input through its own prompt is a leash, not an exoskeleton, and the friction of formally stopping the agent is what trains people to let it run unsupervised.

**Status**: superseded by ADR-0008

**Consequences**: the host must detect external writes and must never overwrite a file it has not re-read since the last change.
