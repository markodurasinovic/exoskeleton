# Show the recommendation before the decision

Every handback that asks the human to decide presents the options, Exo's recommendation, and its reason, before the human chooses. The human is an experienced developer expected to push back; withholding the recommendation to protect against anchoring trades a real cost — slower, more anxious decisions — for a benefit that only applies to someone who cannot yet judge, and it makes the harness feel evasive.

**Status**: accepted

**Consequences**: a bare "I recommend X" invites compliance, so a recommendation is always shown against its alternatives and with its reason. The learning signal moves from first-principles judgement to **divergence**: an accepted recommendation teaches nothing, so the record of overrides and their outcomes becomes the core learning artifact rather than a nice-to-have.

## Considered Options

- **Withhold until after the human chooses** — maximum protection against anchoring, but it slows every decision and patronises the user the harness is built for.
- **Show only on request** — leaves the human deciding without the strongest available input, and hides the model's judgement from the record.
