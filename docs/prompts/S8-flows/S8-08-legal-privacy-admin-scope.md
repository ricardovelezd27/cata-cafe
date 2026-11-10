# S8-08 — Legal pages, consent, admin scope

> **When:** after S8-07 (account deletion removes the waitlist row) · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** final privacy and terms text (es, en); `ANALYTICS_SUPER_ADMIN_EMAIL` set in Vercel BEFORE deploy; one additive `migrate deploy`
> **Findings:** 6 (2 P1 · 1 P2 · 3 P3) from `docs/audits/flows-2026-11/18-landing.md`, `17-insights-admin.md` · **Gated on Kim:** D4

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list. Theme: the public site
says who stores what and why, and privileged admin data is scoped, logged and attributable. Invariants:
authz at the server (Prisma bypasses RLS), never log emails, scoring and AggregateScore untouched,
boot-time env assertions, landing stays statically rendered. NEVER invent legal text: Ricardo owns the
wording; ship typed placeholders marked as drafts. Out of scope: throttles (S8-03), waitlist form states
(S8-06), digest idempotency and chat quota (S8-14). Haiku may mirror i18n and write log-shape tests;
Sonnet may build the pages; the lead keeps the scope helper, migration and consent fields. Work the plan
in order, one commit per step, `npx tsc --noEmit && npm run lint && npm test` before each commit, update
docs/flows.md in the same PR, and finish with the Definition of done checklist in the PR description.
Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-landing-1 | P1 | CONFIRMED | Email stored with no notice, policy pages or consent record (`waitlist.ts:34`, `LandingFooter.tsx:38,41`) | `18-landing.md` |
| F-insights-1 | P1 | CONFIRMED | Flagged/AI admins see every cupper by name (`analytics.ts:50-89`, `queries.ts:329-331`) | `17-insights-admin.md` |
| F-insights-2 | P2 | CONFIRMED | No audit trail for export, grants, directory (`analytics.ts:200-268`) | `17-insights-admin.md` |
| F-landing-6 | P3 | CONFIRMED | No source/cohort; second form hides the promise (`FoundingSection.tsx:59-64`) | `18-landing.md` |
| F-insights-5 | P3 | CONFIRMED | Super-admin Gmail fallback, unasserted (`access.ts:11-13`, `env.ts:17-26`) | `17-insights-admin.md` |
| F-insights-4 | P3 | CONFIRMED | Chat logs question text via `console.info` (`aiChat.ts:103-105,145`) | `17-insights-admin.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| D4 | Who sees each cupper's score by name in platform analysis? (a) session owner · (b) admins with name · (c) admins anonymous, no groups under 3 | (c) | Everyone except the super-admin sees own data only; the super-admin sees platform with "Catador N" and groups under 3 suppressed. Names stay behind one constant |

## 4. Plan

1. **Legal pages** — `app/[locale]/privacidad/page.tsx` and `terminos/page.tsx` (sole segment `[locale]`, so `generateStaticParams` is right); typed `lib/legal/{privacy,terms}.ts` `{es,en}` with a visible "Borrador" banner until Ricardo pastes final text. Public, outside `/app`. Link from `LandingFooter.tsx` (replacing the `mailto:` pair), both waitlist forms, login and the Cuenta card. Covers: F-landing-1.
2. **Consent record (one additive migration)** — `WaitlistEntry.consentAt`, `consentNoticeVersion`; `reserveFoundingSeat` stamps both. One line under each form (who stores the email, why, link), checked at 375 px; the "te avisaremos" mail reworded as a one-off notice with a baja line (Ricardo confirms). Retention (for example 12 months without an account) written into the runbook, no job. RLS-on-no-policies stays. Covers: F-landing-1.
3. **Source and cohort** — hidden `source` input (`hero | founding`, plus a sanitized `?src=` read from `window.location` in an effect so the page stays static); validated in the action; promise line under both forms. Covers: F-landing-6.
4. **Deletion test** — assert S8-07's `deleteAccount` removes the waitlist row. Covers: F-landing-1.
5. **One scope helper** — `lib/analytics/scope.ts` `scopeFor(access)`: super-admin platform, all others `{ kind: "user", userId }`. Apply to `runInsight`, `runPivot`, `listPivotDimensionValues`, `insights/page.tsx`, `api/insights/report/route.ts`, `app/actions/ai.ts`, and replace the inline copy at `aiChat.ts:78-80`. Platform scope: `cupper` labels "Catador 1, 2…", groups under 3 suppressed. Digest sends platform KPIs to the super-admin only. Test for three levels. Covers: F-insights-1.
6. **Audit log** — `logInfo({ where: "audit", action, actorId, targetId?, count? })` for CSV export, grant/revoke and directory load; never an email. Extract the page-local `maskEmail` from `groups/[id]/page.tsx` into `lib/maskEmail.ts`, mask by default with "mostrar", also in the phone cards. CSV stays super-admin only by default (Ricardo confirms). Comment that the co-cupper rule intentionally does not apply to this admin directory. Covers: F-insights-2.
7. **Chat logs** — both `console.info` calls become `logInfo` with action, user id, scope kind, tool name, counts, outcome; no question or argument text. Covers: F-insights-4.
8. **Super-admin via env** — add `ANALYTICS_SUPER_ADMIN_EMAIL` to `REQUIRED_IN_PRODUCTION`, dev-only fallback, runbook §3, extend the `missingProductionEnv` test. Covers: F-insights-5.
9. **Docs** — `docs/flows.md`; CLAUDE.md "Insights Access Levels".

## 5. Acceptance (tests to write or checks to run)

- F-landing-1: footer links resolve in es and en; notice visible without scrolling at 375 px under both forms; the row stores consent time and notice version; account deletion removes the row; retention written down.
- F-insights-1: a flagged user pivoting by cupper sees only cuppers of sessions they own; `listPivotDimensionValues('evaluations','cupper')` returns only that network; their report PDF holds only their numbers; `scopeFor` unit test for three levels.
- F-insights-2: export, grant and revoke each emit one searchable line with the actor id and no email; masked by default.
- F-landing-6: rows differ by `source`; `?src=chile` stored; both forms show the promise.
- F-insights-5: production boot without the variable fails naming it.
- F-insights-4: no line from `aiChat.ts` contains question or argument content.

## 6. Manual steps for Ricardo

- Provide final legal copy; approve notice wording and retention.
- Set `ANALYTICS_SUPER_ADMIN_EMAIL` in Vercel Production before deploying (the deploy fails by design otherwise).
- `migrate deploy` for the two WaitlistEntry columns; no SQL phase.

## 7. Risks and rollback

- Kim (an AI admin) loses the platform explorer; the chat already worked this way; one line in `scopeFor` flips it.
- Rollback for the env assertion is setting the variable, not reverting.
- Draft legal text must not ship as final; the banner is the guard. Not legal advice.

## 8. Native-readiness clause

Privacy and terms are in-app links that keep the signed-in session; the S8-07 deletion entry is linked from the privacy page; masked emails hold in the shell, and the blob CSV download is S8-15's.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`analyticsScope`, env, audit-log shape tests)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-08 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for legal pages, both forms, masked directory
- [ ] gated items either done or left as named TODOs listed in the PR description
