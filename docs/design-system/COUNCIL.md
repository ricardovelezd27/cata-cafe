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

Operating rules (cost in tokens, the owner 2026-11-21):
- One session per package: it starts with a short brief and closes when the package merges. An old session is never reused for new work. State lives in files (the pull request, a handover note, the memory file), never only in a chat.
- The orchestrator hands over to a fresh session at every pause or after about 150k of conversation, writing the state to the memory file first.
- Few, large steps: chain commands, run all checks in one command, one notification per merge. No polling and no status reply that says nothing changed.
- The cheapest model that can do the job: Haiku or Sonnet for mechanical work, Opus for risky code, Fable only for orchestration and hard design. The brief states the model.
- A reviewer gets the diff and the one section of the rules it checks, never a whole document. The developer runs the reviews before reporting, so a change takes one round.
- Every report to the owner gives: what is live, percent complete, and the tokens used per agent and model.
