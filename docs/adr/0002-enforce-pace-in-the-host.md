# Enforce pace in the host, with two independent limits

Exo enforces a time-triggered cadence limit (default five minutes) and progress-based dead-end rules in the host process, never by asking the model to stop on its own. Cadence answers "has the human been offered a decision recently"; dead ends answer "is the work advancing". Collapsing them into one timer turns a single long loop into twelve short ones, and letting the model self-report either condition turns a guarantee into a hope.

**Status**: accepted

## Considered Options

- **Model self-reports that it is stuck** — cheapest, but the failure mode being defended against is a model that believes the next attempt will work.
- **A single max-steps counter** — bounds total work but not the interval between decisions, and a counter cannot tell productive work from repetition.
- **A time limit only** — responds to the human's patience but not to a loop that fails forty times in ninety seconds.
