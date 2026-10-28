# The input is always live

Exo never takes the keyboard away to ask a question. Decisions are shown inline with numbered options: `enter` on an empty line accepts the recommendation, a number or the option's name selects one, and anything else typed is a redirect carrying the human's own words. A modal that must be dismissed before you can type again turns the harness into a wizard, and the human's next thought is often not one of the options.

**Status**: superseded by ADR-0008

**Consequences**: no focus-stealing component except explicit pickers and menus the human invokes (`/model`). Typed text during a lease becomes steering, delivered at the next boundary. A decision and an instruction share one gesture, so the conversation never stops being a conversation.

## Considered Options

- **Modal menus** — unambiguous answers and a visible cursor, but the harness owns the keyboard while it waits.
- **Numbered options in the transcript** — the same information, no focus change, and room for an answer nobody anticipated.
