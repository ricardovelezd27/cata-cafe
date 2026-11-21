# Project map

## Tech Stack

| Layer | Library | Installed version (`package.json` ranges are looser) |
|---|---|---|
| Framework | Next.js App Router | 16.4.6 |
| UI Runtime | React + React DOM | 19.2.4 |
| Language | TypeScript | 5 (strict) |
| ORM | Prisma + PrismaPg adapter | 7.7.0 |
| Database | PostgreSQL (via Supabase) | — |
| Auth | Supabase Auth (email link + 6-digit code, Google, anonymous guests; no passwords) | 2.104.0 |
| SSR Auth | @supabase/ssr | 0.10.2 |
| i18n | next-intl | 4.14.10 |
| Styling | Tailwind CSS 4 + PostCSS | 4 |
| Client State | Zustand | 5.0.12 |
| Charts | Recharts | 3.8.1 |
| PDF | @react-pdf/renderer | 4.5.1 |
| Primitives | Radix UI (dialog) | 1.1.15 |
| Icons | lucide-react | 1.8.0 |
| Offline storage | localforage (IndexedDB) | 1.10.0 |
| Flavor search | Fuse.js (fuzzy typeahead) | 7.4.2 |
| Animation | GSAP (marketing landing only) | 3.15.0 |

---

## Project Structure

```
cata-cafe/
├── app/
│   ├── [locale]/                   # All routes are locale-prefixed
│   │   ├── page.tsx                # Public marketing landing page (es default, /en secondary)
│   │   ├── app/                    # Authenticated routes
│   │   │   ├── layout.tsx          # Auth guard — redirects unauthenticated users
│   │   │   ├── page.tsx            # Dashboard (DashboardIntro + recent sessions + group badges)
│   │   │   ├── coffees/
│   │   │   │   ├── page.tsx        # Coffee list (public + owned)
│   │   │   │   └── [id]/page.tsx   # Coffee profile + tasting history
│   │   │   ├── profile/
│   │   │   │   ├── page.tsx        # User profile management
│   │   │   │   └── history/page.tsx # Complete coffee tasting history
│   │   │   ├── coffees/new, [id]/edit  # coffee create / edit forms
│   │   │   ├── groups/             # Tasting groups (list + [id] roster, feed, email)
│   │   │   ├── insights/           # Restricted analytics: explorer, benchmark, chat, users, access
│   │   │   ├── warmup/             # "Movimiento sensorial" library + [slug] player (+ dev-* routes)
│   │   │   ├── team/page.tsx       # Redirects to /app/groups (kept for old links)
│   │   │   └── sessions/
│   │   │       ├── page.tsx        # Session list (own + joined sections)
│   │   │       ├── new/            # Create session wizard (two-step for group)
│   │   │       ├── express/        # "Catar ahora" three-tap solo session
│   │   │       └── [id]/
│   │   │           ├── cup/        # Main cupping interface (CupClient)
│   │   │           ├── waiting/    # Pre-start waiting room (group/async sessions)
│   │   │           ├── results/    # Resultados (overview tiles + a card per coffee, each opening its sheet) / Panel (organizer's matrix)
│   │   │           ├── edit/, invite/  # owner edit form; invite link + QR
│   │   │           └── print/      # HTML twin of the CVA form
│   │   ├── join/[token]/page.tsx   # Invite join page (outside /app/ — no auth guard); join/coffee/[token] for coffee invites
│   │   ├── auth/login/             # Login: email link, 6-digit code, Google (supports ?next= redirect)
│   │   ├── auth/confirm/           # Button page that completes an emailed link (a GET never consumes it)
│   │   ├── auth/claim/             # Guest → account confirmation card
│   │   ├── privacidad/, terminos/, aviso-legal/  # Legal pages, PUBLISHED 2026-11-13 (LEGAL_PAGES_PUBLISHED true)
│   │   └── layout.tsx              # Locale layout (next-intl)
│   ├── actions/                    # Server actions (all mutations live here)
│   │   ├── auth.ts                 # signInWithMagicLink, verifyEmailCode, signInWithGoogle, confirmEmailToken,
│   │   │                           #   accept/rejectPendingSignIn, signOut, switchAccount, requestEmailChange
│   │   ├── join.ts, guestClaim.ts, account.ts  # join forms + checkJoinable; guest claim; account deletion (flag-gated)
│   │   ├── sessions.ts             # createSession, createGroupSession, updateSession, deleteSession,
│   │   │                           #   addSessionSample/renameSessionSample/removeSessionSample (owner, guarded),
│   │   │                           #   upsertEvaluation/upsertPhysical/upsertExtrinsic (member-gated), updateSampleMetadata
│   │   ├── community.ts            # submitAllEvaluations (+ solo auto-close), closeSession, revealSample,
│   │   │                           #   joinViaToken, createInviteToken, setParticipantExclusion, refreshAggregateScores
│   │   ├── coffees.ts              # createCoffee, updateCoffee, deleteCoffees/deleteCoffee (owner-only ANONYMIZE, never a row delete)
│   │   │                           #   + getCoffeeDeleteImpact, visibility/sharing/invites
│   │   ├── groups.ts               # createGroupWithMembers, updateGroup, deleteGroup, roster (add/remove/rename/resend),
│   │   │                           #   leaveGroup (member), GroupPost feed (create/update/delete), email blasts
│   │   ├── offline.ts              # Conflict-aware replay of offline evaluation drafts on reconnect (+ submitLateDraft)
│   │   ├── warmup.ts               # saveWarmupReflection / deleteWarmupReflection (private, registered users only)
│   │   ├── profile.ts              # Profile updates, completeOnboarding
│   │   ├── waitlist.ts             # Landing-page waitlist signup
│   │   ├── analytics.ts, ai.ts, aiChat.ts  # Insights actions (scope from lib/analytics/scope.ts)
│   │   └── dev.ts                  # Dev-only helpers (seed/inspect)
│   ├── api/
│   │   ├── cron/                   # close-expired-sessions (daily 06:00 UTC), insights-digest (monthly) — see vercel.json
│   │   ├── sessions/[id]/          # cva-pdf, participant-summary, ficha-tecnica, results-csv
│   │   ├── coffees/[id]/ficha/, groups/unsubscribe/, insights/report/, health/, dev/
│   ├── auth/callback/route.ts      # Supabase sign-in return (reads ?next=; redirects token_hash links to /auth/confirm)
│   ├── generated/prisma/           # AUTO-GENERATED — DO NOT EDIT
│   └── layout.tsx                  # Root layout
├── components/
│   ├── cupping/                    # Evaluation form components (lifted state, controlled by CupClient)
│   │   ├── CombinedForm.tsx        # Descriptive + affective dual form
│   │   ├── DescriptiveForm.tsx     # Intensity & sensory descriptors
│   │   ├── AffectiveForm.tsx       # 1–9 quality impressions
│   │   ├── PhysicalEvalForm.tsx    # Green bean assessment (defects, color, screen)
│   │   ├── ExtrinsicForm.tsx       # Post-reveal origin data entry
│   │   ├── FlavorPicker.tsx        # Flavor-wheel selector: predictive typeahead (Fuse.js) + browsable modal
│   │   └── PhaseStepper.tsx        # Phase/step progress indicator
│   │   # NOTE: CupClient.tsx lives at app/[locale]/app/sessions/[id]/cup/CupClient.tsx —
│   │   #       it is the orchestrator (sample nav, tabs, auto-save, master controls, realtime)
│   ├── ui/                         # Atomic design system (replaced old per-form widgets):
│   │   #   IntensitySlider, AffectiveBubbles, CATAPills, CupIndicators/CupToggleGrid,
│   │   #   MasterControls, SampleTabs, SessionShell, ResponsiveDialog, Notes…
│   │   #   PLUS the shared list/CRUD kit (2026-08 cohesion overhaul):
│   │   #   Button/ButtonLink, DataTable (sort/search/facets/pagination, desktop table + mobile cards),
│   │   #   Badge/StatusPill/ScorePill, PageHeader, SearchInput, Select, EmptyState,
│   │   #   Pagination, FilterBar, ConfirmDialog — ALWAYS reuse these for list pages,
│   │   #   status/score pills, page headers, and delete confirmations.
│   ├── results/                    # SessionOverview + CoffeeCards (R2), the coffee's sheet (R3: SampleDetail in SampleDetailDialog),
│   │   #   Learnings (R4b: "Aprendizajes" + the reflection, closed sessions),
│   │   #   CupperAlignment, ExtrinsicSummary, chartColors (Recharts palette, MD3-derived hex),
│   │   #   PanelView (R5: the organizer's Panel) + PanelMatrix + OwnerParticipantSection (matrix + exclusion switches),
│   │   #   ScoreBreakdownPanel ("¿Cómo se calculó?" — typed t prop, no private LABELS dict).
│   │   #   MyResultsSummary/IndividualResultsPanel DELETED (2026-08 results redesign);
│   │   #   folded into the overview (SessionOverview, R2) + OwnerParticipantSection (owner matrix).
│   │   # The results ROUTE (app/[locale]/app/sessions/[id]/results/) owns the shell:
│   │   #   ResultsClient.tsx (tabs, header, the open coffee in the address: useSheetAddress.ts).
│   │   #   First view = the overview (SessionOverview, R2) then one card per coffee (CoffeeCards);
│   │   #   "Panel" = PanelView (R5): late evaluations, the matrix, who counts, the post-close notes, the alignment.
│   │   #   DELETED: ScoreTable, SampleRadarChart (R2); DescriptoresTab, WordCloud, lib/wordCloud,
│   │   #   DescriptorFrequency, SampleComparisons, SampleGroupBlock (R3). FlavorCloud moved to
│   │   #   components/coffees/ (only the coffee profile uses it).
│   ├── landing/                    # Marketing landing (dark stage), rebuilt 2026-11 as the design system's reference:
│   │   #   Hero (one message + four icon chips) + HeroFoundingCard (an offer token whose button goes to the form: ScrollToLink),
│   │   #   StepsShowcase (three app screens that pile up; StepsActiveObserver + stepsProgress.ts),
│   │   #   FeaturesSection (six equal cards, each with a drawing), AudienceSection (photo cards),
│   │   #   FoundingSection (#fundadores: the page's ONE reservation form), FinalCTA (closing line + NewsletterForm),
│   │   #   SectionHeading (THE section header: fold line + idea/assertion title, centred at every width), PhotoSlot, WaitlistForm,
│   │   #   ScrollDeck + DeckRail + deckProgress.ts (the phone "scroll stage" of "Cómo funciona" only),
│   │   #   CarouselControls (desktop arrows) + CarouselSteps (numbered steps under a phone's sideways row) + carouselIndex.ts,
│   │   #   LocaleSwitch + scrollAnchor.ts (language change without reload, keeps the reader's place),
│   │   #   ScrollFx (GSAP text reveals only; it clears the inline styles of every data-reveal element)
│   │   └── journey/                # Persistent particle canvas: formations.ts + bracket.ts (pure, tested),
│   │       #   ConstellationCanvas (engine + kill-switch; governor and dialect in lib/canvas/), ConstellationMount (idle gate). README inside.
│   ├── offline/                    # OfflineBanner, SyncConflictModal, OfflineFirstLoadError, UnsyncedNotesPanel, StaleBundleNotice
│   ├── auth/, guest/, join/        # EmailSentState + ClaimCard; GuestGateProvider/GuestGateLink; join forms
│   ├── warmup/, session-moments/   # warm-up player + figures; the /cup interstitial
│   ├── coffees/, groups/, insights/, profile/, legal/, pwa/, errors/
│   ├── session/                    # CloseAnnounce (cupper banner), DeadlineBanner
│   ├── onboarding/                 # WelcomeModal, OnboardingWrapper (role/country capture)
│   └── layout/, dashboard/         # App shell + dashboard widgets (DashboardIntro, StatCard, FormatBadge)
├── hooks/
│   ├── useConnectivity.ts          # Online/offline detection
│   └── useOfflineSync.ts          # Drains offline draft queue on reconnect
├── lib/
│   ├── prisma.ts                   # Prisma singleton — always import from here
│   ├── scoring.ts                  # SCA CVA formula — do not reimplement
│   ├── sessionAuth.ts              # requireSessionOwner/Member + requireSampleOwner/Member — THE authz gate
│   │                               #   (Prisma runs as postgres and bypasses RLS; these TS checks are the real gate)
│   ├── sessionRouting.ts           # sessionHref() — where clicking a session goes (closed→results, etc.). Never hardcode /cup in lists.
│   ├── coffeeHistory.ts            # syncCoffeeHistoryForSession() — plain lib fn, callers must authorize first
│   ├── evaluation.ts               # Derived-score computation shared by live + offline paths
│   ├── constants.ts                # All cupping reference data (FLAVOR_WHEEL, attributes, defects…)
│   ├── descriptors.ts              # Descriptor helpers + unmapped-note resolution
│   ├── flavorSearch.ts             # Fuse.js predictive search over FLAVOR_WHEEL (powers FlavorPicker)
│   ├── closeSession.ts, closeRules.ts  # the one close routine + pure rules (idle close, grandfather rule)
│   ├── closeAnnounce.ts, lateContributions.ts  # announced close + late evaluations / notes after close (pure rules)
│   ├── cupDefects.ts, affectivePartial.ts, cuppingTimer.ts  # per-cup defect type; "no evaluado" + cooled value; timer cues (pure)
│   ├── coffeeLifetimeScore.ts  # coffee lifetime score at read time (pure; never stored)
│   ├── scoreRule.ts, scoreLine.ts  # rule versions v1/v2; the one-line arithmetic of a score
│   ├── revealFreeze.ts         # which evaluation modules freeze once a sample is revealed
│   ├── sessionLock.ts, lockTimeout.ts, evaluationPinWrite.ts, pinnedViewHydration.ts  # lock order + pinned saves
│   ├── blindLabels.ts, samplePrep.ts, sampleCount.ts  # creating a session (S10 WP2)
│   ├── reports/, pdf/              # pure report models (ranking, ficha, summaries, CSV) / react-pdf documents + charts
│   ├── canvas/                     # the particle dialect shared by the landing's constellation and the warm-up's stage field:
│   │                               #   particles.ts (seed, frame-rate-independent easing, drift, dot size, colour parsing), governor.ts
│   ├── platform/                   # the ONLY place for native-shell / browser-API differences
│   ├── accountDeletion/            # deleteAccount plan + manifest (also drives the guest-merge column list)
│   ├── analytics/, ai/, warmup/, coffees/, landing/, legal/  # legal/ = the typed legal pages; warmup/ = timeline, sounds, reflections
│   ├── offline/
│   │   ├── store.ts                # localforage/IndexedDB draft store — CLIENT ONLY, SSR-safe (no-ops on server)
│   │   └── types.ts                # Offline blob + sync-status types
│   └── supabase/
│       ├── client.ts               # Browser client (Realtime + offline)
│       ├── server.ts               # Server-side Supabase client (cookie-based)
│       ├── ephemeral.ts            # Cookie-less client (verifies a sign-in token without touching the browser session)
│       └── admin.ts                # Service-role client — SERVER ONLY, never import from client components
├── tests/                          # Vitest unit tests (npm test); tests/db/ = disposable local-Postgres suite (npm run test:db)
├── docs/                           # flows.md (normative diagrams), LAUNCH-RUNBOOK.md, handover/, product/, prompts/
├── prisma/
│   ├── schema.prisma               # Database schema
│   ├── migrations/                 # Versioned migrations
│   └── sql/rls_and_triggers.sql    # Supabase RLS policies & triggers — APPLY MANUALLY via Supabase SQL editor
├── i18n/
│   ├── routing.ts                  # Locale config: ["es", "en"], default "es"
│   └── request.ts                  # Per-request locale resolution
├── messages/
│   ├── es.json                     # Spanish translations (default)
│   └── en.json                     # English translations
├── proxy.ts                        # Middleware: session refresh + i18n routing (Next.js 16 — must be proxy.ts)
├── prisma.config.ts                # Prisma CLI config (reads .env.local)
└── next.config.ts                  # Next.js config with next-intl plugin
```

## Codebase Navigation

Use the native search tools (Grep, Glob, Read) as the primary way to explore this
codebase — they are fast, always reflect the current source, and integrate with the
editor. The structure documented above plus these tools is sufficient for almost all
work here.

> **Overrides global config:** Any global instruction to "query the knowledge graph
> first / avoid reading raw files" does **not** apply to this project. We evaluated the
> graphify integration on this 123-file codebase and found it added little over native
> tools while introducing staleness risk, so it is **not** part of the default workflow.
> A `graphify-out/` graph may exist on disk (gitignored) and the `/graphify` skill is
> available for deliberate, manual use, but treat any graph output as possibly stale and
> verify against the actual source before relying on it. Do not query the graph by
> default and do not auto-rebuild it.

---

## Database Schema (Key Models)

| Model | Purpose |
|---|---|
| `Profile` | User account (id = Supabase user UUID); `role`, `country`, `onboardingCompleted`, `analyticsAccess` |
| `CuppingSession` | A cupping event (format, date, status, isGroup, isAsync, closesAt, cupsPerSample, `closingAt` = announced close (S10 WP4b), `entriesLocked`, `notifyGroupAtStart`, `closeFinalizedAt`); `referenceSampleId → SessionSample` (SetNull; display-only "Referencia", Δ via `lib/referenceDelta.ts`); `warmupStartedAt` — master-led synced warm-up run (PR3); `referenceMode` — `anchor` (pinned 79.00) or `free` (S10 B1) |
| `SessionSample` | A coffee sample within a session (position, label, revealed, coffeeId); owner-only blind prep data `roastDate`/`preparationNote`/`offProtocol`/`offProtocolNote` (S10 A9, ungranted); `referencedBy` — back-relation from `CuppingSession.referenceSampleId` (at most one session per sample) |
| `Evaluation` | A cupper's score for one sample (JSON data + computed scores, isDraft, submittedAt; `cups` = cups it covers, NULL = scored under the old rule, S10 WP1a; `acceptedLateAt` / `receivedLateAt` / `postCloseNote` + `postCloseNoteAt`, S10 WP4b; `lastClientWriteAt`, S8-18) |
| `PhysicalEvaluation` | Green bean assessment for a sample (pre-reveal) |
| `ExtrinsicData` | Origin/processing info revealed post-tasting |
| `Coffee` | Coffee product reference data; `code` — unique 6-char short code (`lib/coffeeCode.ts`), stamped at every create path; `originEditedAt` = the last change of an origin field (S10 WP5a) |
| `SessionParticipant` | Links a user to a group session (status: "invited"\|"joined"\|"owner"; `excludedFromResults`) |
| `AggregateScore` | Trigger-computed community score for a sample (one per SessionSample); `ruleVersion` 1 = old rule, 2 = current (stamped by the PHASE 26 / 29 function) |
| `UserCoffeeHistory` | Per-user record of coffees tasted with individual + community scores. `coffeeId` is NULLABLE (S8-16): a NULL row is LABEL-ONLY (coffee-less sample, or a never-revealed sample whose session was deleted), keyed on `evaluationId` by `ensureLabelRows` (the unique does not dedupe NULLs), replaced by the coffee row on assign, built for display by `lib/historyDisplay.ts` (`historyDisplay`, `isCoffeeRow`). Every reader must handle `coffee: null`, never link such a row to a coffee page and exclude it from "coffees tasted"; its snapshot never carries coffee fields. |
| `SessionInvite` | Invite token for joining a group session (maxUses, expiresAt, `active`) |
| `WarmupReflection` | A person's private warm-up reflections (S10 WP7): no API-role grant (PHASE 27), read and written only with Prisma scoped by user id |
| `WaitlistEntry` | Founding-seat reservation (`source`, `consentAt`, `consentNoticeVersion`); moved with an email change (`lib/waitlistMove.ts`) |
| `TastingGroup`, `TastingGroupMember`, `GroupPost` | Standing roster, its members (`emailOptOutAt`) and the feed |
| `OutboundEmailEvent`, `GroupEmailDelivery`, `CloseEmailDelivery`, `SessionReminderDelivery`, `DigestRun` | Email budgets and delivery ledgers (S8-03, S8-14, S9-01). They hold no address in clear (keyed hashes, member ids, user ids), except `DigestRun.results`, which keys each outcome by the super-admin's address (`lib/digestClaim.ts`) |

**Cascade deletes:** Deleting a `SessionSample` cascades to `Evaluation`, `PhysicalEvaluation`, `ExtrinsicData`, and `AggregateScore`. Deleting a `CuppingSession` cascades to `SessionParticipant` and `SessionInvite`.

**Always use** the Prisma singleton at `lib/prisma.ts` — never instantiate `PrismaClient` directly.

---

## Reference Data

All cupping reference data is in `lib/constants.ts` (Spanish-labeled):

- `FLAVOR_WHEEL` — flat list of 3-level flavor-wheel nodes (L1 group → L2 → L3 leaf) with bilingual labels, `parentId`/`level`, synonyms, and group colors. Helpers: `flavorNodeById`, `flavorChildren`, `flavorGroupColor`, `migrateFlavorId`. `FLAVOR_FAMILIES` is a back-compat 2-level view derived from it. (Replaces the old `FLAVOR_TREE`.)
- `ACIDITY_DESCRIPTORS`, `SWEETNESS_DESCRIPTORS`, `MOUTHFEEL_DESCRIPTORS` / `MOUTHFEEL_OPTIONS`
- `GUSTOS_PREDOMINANTES` / `MAIN_TASTES` — basic tastes
- `AFFECTIVE_ATTRIBUTES` — 8 scored attributes (Fragancia, Aroma, Sabor, etc.)
- `AFFECTIVE_LABELS` — 9-point scale labels
- `CAT1_DEFECTS`, `CAT2_DEFECTS` — green bean defect categories with ratios
- `GREEN_COLORS`, `SCREEN_SIZES`, `PROCESS_TYPES`, `CERTIFICATIONS`
