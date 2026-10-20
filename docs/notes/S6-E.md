# S6 Stream E — notes for flows.md / CLAUDE.md (merged by the lead)

PRs: E1 #27 landing · E2 #29 coffee search · E3 EN readiness (this branch) · E4 #31 native memo · E5 #32 users CSV.

## For CLAUDE.md
- **Landing**: hero title is now "El paladar de tu grupo, calibrado y medido." (Ricardo's pick among Kim's options); `landing.hero.ctaNote` sits under the founding-card CTA; `landing.header.signInShort` = "Entrar" (shown <640px, full "Iniciar sesión" ≥sm).
- **Coffee list**: search also matches `farm`, `producer`, `processType` (null-safe — anonymized coffees). `getCoffeesWithStats` now selects `farm` + `producer`. Variety facet groups by `normKey` (accent/case-insensitive), capped at 20 most common (`VARIETY_FACET_CAP`); there is no variety alias table in `lib/analytics/normalize.ts`, so synonyms/typos stay separate.
- **Users CSV**: `exportRegisteredUsersCsv()` in `app/actions/analytics.ts` (`run()` + `requireUsersDirectoryAccess()`), pure builder `lib/analytics/usersCsv.ts` (formula-injection guard); `listAllAuthUsers` now returns `createdAt`. PII is returned to the caller, never persisted/logged.
- **Brand**: user-visible "Cata Café" → "Café Sensible" in closeEmail, pdf/*, groups.ts emails, insightsDigestEmail, narratives prompt, PrintClient wordmark. Still "Cata Café"/catacafe: `lib/email.ts` sender (deferred until the Resend-verified cafesensible.ai domain), `components/insights/InsightCardComposer.tsx` (card wordmark + `catacafe.app`), `design_handoff_*`, docs.
- **WelcomeModal** now takes a `translations` prop (`messages` → `onboarding`, built in `app/[locale]/app/layout.tsx`); `goTo` is a raw `{label}` template replaced client-side.

## Open i18n debt (from docs/notes/S6-E-en-audit.md, not fixed here)
`lib/closeEmail.ts` is Spanish-only (no locale branch — most serious); `ExtrinsicForm`, `PhysicalEvalForm`, `ExtrinsicSummary`, `ScoreDisplay`, `FlavorPicker` bits have no `t()`; relative-time strings (`CoCupperCard`, `GroupActivityFeed`, `app/page.tsx`) use es/en ternaries; email templates in `groups.ts` are inline locale maps. Audit caveat: unaccented-Spanish sweep skipped `app/`; `CoffeesTable` process keys and `CupClient` leave-guard literals need a verify.

## For flows.md
None (no flow changes). E4 memo (docs/product/native-app.md) recommends PWA-first; offline session creation by coffee code is a web-app change if Kim wants it.
