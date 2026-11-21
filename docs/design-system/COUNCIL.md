# The council: who checks what before anything reaches production

The owner's method (2026-11-21). One package of work passes through these roles. The orchestrator
(the governing session, on Fable) hands out the work, picks each role's model and effort by the
difficulty of the package, and is the only one who merges.

| Role | Does | Agent | Model, effort |
|---|---|---|---|
| Story keeper | Every sentence the owner wrote is done; nothing else is there | `council-story-keeper` | Sonnet, medium |
| Designer | The design system is used, and only it (`DESIGN.md`) | `design-system-reviewer` | Opus, high |
| Flow monitor | Every flow still walks end to end; `docs/flows.md` is true | `council-flow-monitor` | Sonnet, medium (Haiku for a diff that removes one link) |
| Developer | Builds the package from a brief that quotes the owner | a worker session | Fable for a redesign; Opus for the cupping screen, scoring, sync; Sonnet for small or mechanical changes |
| Code reviewer | Bugs, broken project rules, leftovers | `council-code-reviewer` | Opus, high near saving, sync, scoring, gates, PDFs; Sonnet otherwise |
| Over-engineering critic | Nothing unasked, nothing twice, nothing without a purpose | `overengineering-critic` | Opus, medium |
| Merge gate | Reads the five verdicts, test-merges on main (types, lint, tests), merges, checks the deploy, marks the Flowmap | the orchestrator | Fable |

Rules:
- Before the work: the story keeper and the critic read the BRIEF. After the work: all five read the PULL REQUEST. A CHANGE goes back to the developer; the role that said CHANGE checks the fix.
- A role with nothing to check is skipped, and the pull request says so (no flow touched: no flow monitor).
- A product choice is never settled by a role: it goes to the owner as a one-word question, and his answer is written into `OVERENGINEERING-LOG.md`.
- A cupping-screen change also waits for the owner's phone test.
