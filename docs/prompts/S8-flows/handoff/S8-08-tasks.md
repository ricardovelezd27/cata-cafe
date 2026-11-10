S8-08 PLAN (checked against origin/claude/s8-03-guest-guard-email-impl, call it B3)

1. BUILDABLE NOW
T1 (F-insights-1) Add lib/analytics/scope.ts with pure scopeFor(access): super-admin returns platform, everyone else returns {kind:"user",userId}. Unit test for the 3 levels. Files: lib/analytics/scope.ts, tests/analyticsScope.test.ts.
T2 (F-insights-1) Apply scopeFor in runInsight, runPivot, listPivotDimensionValues, runBenchmark and runOriginContext (analytics.ts), insights/page.tsx (getDashboardData), api/insights/report/route.ts (also getBenchmarkComparison), app/actions/ai.ts (lines 58, 86, 105), benchmark/explorer pages, and aiChat.ts:78-80. Pass the scope through every query function. Default D4=(c): in platform scope the cupper label becomes "Catador N" and groups under 3 are suppressed.
T3 (F-insights-1) The digest must send platform KPIs only to the super-admin. Other recipients get user-scoped data or are dropped (lib/insightsDigestEmail.ts:253-273).
T4 (F-insights-2) Audit log: logInfo({where:"audit",action,actorId,count}) for exportRegisteredUsersCsv, setAnalyticsAccess and listAnalyticsUsers. No emails. Add a tests/ log-shape test.
T5 (F-insights-2) Mask emails by default in UsersDirectory using the existing lib/maskEmail.ts, with a "mostrar" toggle. Also in the mobile cards. Add es/en keys.
T6 (F-insights-4) In aiChat.ts, replace the console calls at lines 90, 103, 145, 153, 174 and 207-208 with logInfo/logError. Fields: action, userId, scope kind, tool name, counts, exit. Do not log the question or the args.
T7 (F-insights-5) Add ANALYTICS_SUPER_ADMIN_EMAIL to REQUIRED_IN_PRODUCTION. Drop the Gmail fallback in access.ts outside dev. Update runbook §3 (line 205). Add a tests/env.test.ts (none exists).
T8 (F-landing-1) Create app/[locale]/privacidad/page.tsx and terminos/page.tsx, with lib/legal/{privacy,terms}.ts as {es,en} placeholder text and a visible "Borrador" banner. Link them from LandingFooter, both forms and the login page. Add a profile "Cuenta" link only if S8-07 is not needed for it.
T9 (F-landing-1) Add one notice line under both waitlist forms, with the link (keys in messages/*.json). Check 375px.
T10 (F-landing-1, flagged) Schema: WaitlistEntry.consentAt and consentNoticeVersion (nullable, additive). reserveFoundingSeat stamps both inside the existing sendMagicLink callback.
T11 (F-landing-6) Hidden `source` input. hero|founding come from the form variant. A sanitized ?src= is read in an effect so the page stays static. The action validates it against an allowlist or regex and writes `source`. Show the promise line under the founding form.
T12 Docs: flows.md, CLAUDE.md "Insights Access Levels", and the retention default (12 months, no job) in the runbook.

2. GATED
- D4 option (a)/(b) names: the spec gives default (c), so build (c). Keep names behind one constant, `// TODO(D4): Kim to confirm (a/b/c)`.
- Final legal text: Ricardo owns it. Ship drafts. `// TODO(owner): paste final privacy/terms text`.
- Wording of the "te avisaremos" mail, and the retention period: spec says "Ricardo confirms". Build a one-off-notice wording and leave `TODO(owner)`.
- CSV export stays super-admin only: the spec says "by default (Ricardo confirms)". Build that restriction. It is a behaviour change, since AI admins have it today via requireUsersDirectoryAccess.
- The "deleteAccount removes the waitlist row" test (plan step 4) cannot be built, because deleteAccount does not exist (S8-07). Leave `TODO(S8-07): delete waitlistEntry by email in deleteAccount + test`.
- Final legal links in the Cuenta card and in the S8-07 deletion entry wait for S8-07.

3. FACTS FOR THE ARCHITECT
- lib/maskEmail.ts already exists on B3 (S8-03). Step 6's "extract maskEmail from groups/[id]/page.tsx" is done. Only reuse it.
- Scope infrastructure already exists: AnalyticsScope and PLATFORM_SCOPE in lib/analytics/types.ts, and all of queries.ts and benchmarks.ts take a scope parameter. The work is only a derivation helper plus call sites. No new query logic is needed except anonymising `cupper` and the under-3 suppression.
- queries.ts:329-331 is the cupper dimension. The labels are built in the row mapper (cupperName at ~161). Two designs: anonymise in the mapper (simple, but labels would not be stable across calls), or post-process in runPivotQuery with a stable index. I recommend the second.
- For flagged users in user scope, scopedEvaluationWhere includes evaluations from cuppers in sessions they own. The audit acceptance says "only cuppers of sessions they own" and that holds. But the cupper dimension would still expose names to the session owner. Under D4(c) the user scope should arguably use "Catador N" too. D4(a) says owner sees names. Decide: I suggest names only for owners in user scope, anonymous in platform scope.
- Chat's isAiAdmin users currently receive user scope in chat, so aligning the explorer to user scope removes the AI-admin platform explorer. The spec accepts this ("Kim loses it").
- Waitlist action on B3 now goes through sendMagicLink(email,next,callback) (lib/magicLink). Consent stamping goes in that callback's prisma create. Spec's `waitlist.ts:34` is stale. The throttle is done (S8-03), so out of scope here.
- `source` column already exists (default "landing"), so step 3 needs no migration. Only consentAt and consentNoticeVersion are new.
- Hero and founding forms share one WaitlistForm component, so the `source` prop is a single change. F-landing-6 audit cites FoundingSection.tsx:59-64. The promise line there is the `note` key (check if it already says "te avisaremos").
- Footer privacy/terms are still mailto: (LandingFooter.tsx:38,41), confirmed on B3.
- Runbook already has §10 and §11 on B3. README reserves §12-§14 for S8-04/05/09, so S8-08 needs a section number allocated at merge (suggest §15 or next free). No SQL phase is needed. PHASE 21 and 22 are taken.
- tests/env.test.ts does not exist on main or B3 (the spec says "extend"). Create it. Only tests/guestScope.test.ts exists nearby.
- Making the super-admin email required is a boot-fail in prod if Vercel lacks the var. Hard dependency for Ricardo before deploy, as the spec says.
- Ten other files call isSuperAdminEmail, and access.ts reads the env at module load. Removing the fallback for non-dev means `SUPER_ADMIN_EMAIL` is empty in dev unless set. Keep the dev fallback.
- Unverified: whether aiChat.ts:174 logs content (it did in the audit). Check at build time.

4. FILES (buildable)
lib/analytics/scope.ts (new), lib/analytics/queries.ts, lib/analytics/access.ts, lib/analytics/types.ts (maybe), app/actions/analytics.ts, app/actions/ai.ts, app/actions/aiChat.ts, app/actions/waitlist.ts, app/[locale]/app/insights/{page,explorer/page,benchmark/page}.tsx, app/api/insights/report/route.ts, lib/insightsDigestEmail.ts, components/insights/UsersDirectory.tsx, lib/env.ts, instrumentation.ts (no change expected), app/[locale]/privacidad/page.tsx and terminos/page.tsx (new), lib/legal/{privacy,terms}.ts (new), components/landing/{LandingFooter,WaitlistForm,FoundingSection,HeroFoundingCard}.tsx, app/[locale]/auth/login/LoginForm.tsx, prisma/schema.prisma, messages/{es,en}.json, tests/analyticsScope.test.ts, tests/env.test.ts, tests/auditLog.test.ts, docs/flows.md, docs/LAUNCH-RUNBOOK.md, CLAUDE.md, audit files.
Prisma migration: YES, one additive (WaitlistEntry.consentAt, consentNoticeVersion), unapplied in PR. SQL phase: no. Runbook: one new section (migrate deploy, ANALYTICS_SUPER_ADMIN_EMAIL, retention).

5. SIZE: M. Most of it is buildable: only legal text, deletion test and wording are gated. Worth its own PR. Split in two commits if desired: admin scope (T1-T7) and legal/consent (T8-T11).