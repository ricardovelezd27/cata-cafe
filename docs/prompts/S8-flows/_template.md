# S8-NN — <Theme in six words>

> **When:** <position in the series; what must be merged before> · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** <SQL apply / migration / answer ids / nothing>
> **Findings:** <count> (<P1 count> P1 · <P2 count> P2 · <P3 count> P3) from `docs/audits/flows-2026-11/<files>` · **Gated on Kim:** <ids or "none">

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list. <Two or three
sentences that frame the theme, the invariants in play, what is explicitly out of scope, and the
delegation split (what Sonnet/Haiku may do, what the lead keeps).> Work the plan in order, one commit per
step, `npx tsc --noEmit && npm run lint && npm test` before each commit, update docs/flows.md in the
same PR, and finish with the Definition of done checklist in the PR description. Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-… | P1 | CONFIRMED | … | `NN-slug.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|

## 4. Plan

1. **<Step title>** — what changes (behaviour first, then the code shape). Files: `a.ts`, `b.tsx`.
   Invariant touched: none | <name> (why it still holds). Covers: F-…
2. …

## 5. Acceptance (tests to write or checks to run)

- F-…: <acceptance clause copied/adapted from the finding>
- …

## 6. Manual steps for Ricardo

- <SQL PHASE NN via Supabase SQL editor; migration deploy; env var; nothing>

## 7. Risks and rollback

- <what could break, how to detect, how to roll back>

## 8. Native-readiness clause

- <what this change must also hold inside a Capacitor/WebView shell, or "no native surface">

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (name the test files)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-NN (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for UI changes
- [ ] gated items either done or left as named TODOs listed in the PR description
