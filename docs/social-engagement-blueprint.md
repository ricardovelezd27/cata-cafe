# Cata Café — Social Engagement Blueprint

**Estado:** propuesta aprobable · **Fecha:** 2026-07-21 · **Alcance:** convertir Cata Café de herramienta de catación a red profesional, sin romper lo que ya funciona.

---

## 1. Thesis

Cata Café should become the **CellarTracker of professional coffee — with Strava's group mechanics — not the Untappd of coffee**: a Spanish-first professional network where the atomic unit is the cupping table (4–8 catadores + a session lead), the "post" is a submitted CVA evaluation the user was going to produce anyway, and the durable asset is a verified, identity-attached sensory-trust graph (blind protocol + `trg_recompute_aggregate` community scores) that no QC tool (Cropster, Tastify) or marketplace (Algrano, TYPICA) offers. At dozens of users, we do not build a social network — we instrument the real-world ritual that already exists: instructors with cohorts, labs with rosters, groups with `TastingGroup`. Every social surface attaches to the existing cupping workflow (session close → reveal → calibration comparison → group digest), degrades gracefully to single-player, and stays private-by-default. The 2025–26 SCA Q→CVA transition gives us a retraining population that needs exactly what we're native to; the success metric is **atomic networks activated per month** (groups that complete a session with 4+ submitted evaluations and run a second within 30 days), not signups or DAU.

---

## 2. The Engagement Loops

Five loops, each anchored to models and code that already exist. The pattern throughout: **the CupClient form is the composer; the evaluation is the content; the group is the audience.**

### Loop 1 — The Reveal Loop (core magic moment)

> Cup blind → submit → session closes → see your score vs. the community score → talk about the delta → schedule the next session.

| Exists today | Missing pieces |
|---|---|
| Group sessions with blind samples (`CuppingSession.isGroup`, `SessionSample.revealed`), invite tokens (`SessionInvite`, `joinViaToken`), trigger-computed `AggregateScore` + `attrAverages`, results group tab, `MyResultsSummary`, realtime updates | **(a)** A per-participant **calibration report** at session close: overall delta vs. community score plus per-attribute deltas computed from `Evaluation` JSON vs. `AggregateScore.attrAverages` ("Acidez +1.2 — sueles puntuar la acidez alto"). Display-only TypeScript, consistent with the `calcCommunityScore()` rule. **(b)** Time-to-first-reveal instrumentation — everything in onboarding should shorten it. **(c)** A "run it again" prompt at close ("¿Programar la próxima cata del grupo?"). |

This is the loop everything else feeds. The reveal is Cata Café's kudos, its leaderboard, and its lesson, all in one screen we already render.

### Loop 2 — The Group Rhythm Loop (strongest measured retention lever)

> Belong to a group → see what the group cupped this week → get the weekly digest → show up to the next session.

| Exists today | Missing pieces |
|---|---|
| `TastingGroup` + members with email invitees, Resend group email, `SessionParticipant`, dashboard group badges | **(a)** A **group activity page** (`/app/groups/[id]`): sessions run, coffees cupped (post-reveal only), community scores, member roster with levels. **(b)** A **weekly Resend digest per group** — "Esta semana en Grupo Norte: 3 cafés catados, puntaje comunitario 86.4 en el Geisha, mejor calibración: Andrea (±0.6)" — the highest-leverage social feature per line of code available right now, because at dozens of users an email that fires only when there IS activity beats an in-app feed checked into emptiness. **(c)** A monthly **group calibration challenge**: everyone blind-cups the same coffee via an `isAsync` session with `closesAt`; results compare deviation. 90% of this is `createGroupSession` + async sessions + the aggregate trigger — it needs framing, not infrastructure. |

Strava's number: club members are 3.5× more likely to be active at 12 months. `TastingGroup` is our club model; it just has no surfaces yet.

### Loop 3 — The Instructor-Cohort Loop (the growth engine)

> Instructor adopts → imports 10–30 students in one act → students build calibration history → students share certificates → next cohort and employers see them.

| Exists today | Missing pieces |
|---|---|
| Invite tokens + magic link with `?next=` redirect + waiting room (join flow is ~80% built), `TastingGroup` rosters, async sessions as "homework", PDF certificate pipeline, levels system | **(a)** **Cohort framing** on `TastingGroup` (a `kind: 'group' \| 'cohort'` field or just UI framing + course dates). **(b)** **QR join**: render the existing invite URL as a QR code for the classroom projector — seconds to the waiting room. **(c)** **Instructor calibration dashboard**: cohort-wide per-attribute deviation spread across sessions ("¿quién está desviado en Dulzor?") — reuses the Loop-1 calibration computation, aggregated. **(d)** **Instructor-branded certificates** listing each student's calibration stats — the artifact students post to LinkedIn/WhatsApp, which recruits the next cohort. The certificate needs an opt-in public web version with a link back (see Loop 5). |

The instructor is the "hard side" of this network: one adoption decision converts a whole class, on a real-world schedule (every new course), with zero social motivation required. The educator landing beachhead already targets exactly this person.

### Loop 4 — The Coffee Data Flywheel (the moat)

> Every submitted evaluation enriches a coffee's community profile → looking up any coffee shows how trained palates scored it → that lookup value attracts the next cupper → their evaluation enriches the next lookup.

| Exists today | Missing pieces |
|---|---|
| `Coffee` model with public/private records, private-by-default published community results, `AggregateScore`, `UserCoffeeHistory`, `FlavorCloud` / `DescriptorFrequency` / `SampleRadarChart` components | **(a)** Richer coffee pages: community score + n cuppers + std deviation + flavor cloud + attribute radar, prominently, when published. **(b)** A **minimum-evaluations threshold** before any aggregate shows (thin aggregates discredit the score with professionals — this is non-negotiable). **(c)** **Seed content**: pre-publish 50–100 public `Coffee` records for recognizable LatAm lots/varieties/processes so search never comes up empty, plus a founder-run monthly open calibration cupping (async, anyone joins) whose published results are the first genuinely public community data. **(d)** Later: public unauthenticated coffee routes, producer claim flow (§ Later). |

This is Vivino's flywheel with professional-grade data: the pitch to a catador is "busca cualquier café y mira cómo lo puntuaron paladares entrenados."

### Loop 5 — The Identity & Artifact Loop (top-of-funnel)

> Cup coffees → archive and profile accrete automatically → shareable artifacts (certificate, Año en Cata) carry your identity to WhatsApp/LinkedIn → peers land on your profile → they sign up.

| Exists today | Missing pieces |
|---|---|
| `UserCoffeeHistory` (the archive), profile with activity levels (Aprendiz→Gran Maestro) + percentile, `/app/profile/history`, PDF report/certificate rendering | **(a)** Make history a first-class **tasting diary**: chronological, searchable, filterable by origin/process/score, exportable. No new logging behavior — only visibility of what users already produce. **(b)** A **flavor fingerprint** on the profile: most-used descriptors, favorite origins, four defining coffees — generated from real evaluation data (Letterboxd's Four Favorites, but earned). **(c)** **Opt-in public web certificate/score card** designed for WhatsApp link previews (WhatsApp > LinkedIn in LatAm): cupper, coffee, score, level, "Catado en Cata Café" link. **(d)** **"Tu Año en Cata"** (December): coffees cupped, origins map, flavor fingerprint, calibration percentile, level progression — built on the existing PDF infra; for professionals it's a credential, not a game. |

---

## 3. Roadmap — Now / Next / Later

### NOW — shippable this month, existing schema only

Everything here is queries, pages, and email over data we already store.

1. **Calibration report at session close** (Loop 1). Compute per-attribute deltas from `Evaluation` data vs. `AggregateScore.attrAverages` in a display-side helper (new `lib/calibration.ts`, same display-only doctrine as `calcCommunityScore`). Render as a panel in the results route next to `MyResultsSummary` and `ScoreBreakdownPanel`. Copy: *"Tu calibración: −0.8 global; Acidez +1.2; dentro del consenso en 6/8 atributos."*
2. **Group activity page** (`/app/groups/[id]`). Derived entirely from existing rows: `CuppingSession` where participants ∩ group members, post-reveal only (`revealed`/closed check), `AggregateScore` per sample, roster with levels. No `ActivityEvent` table needed yet — at this scale a `findMany` over sessions IS the feed.
3. **Weekly group digest via Resend.** New cron route (clone the structure of the existing insights-digest cron: `CRON_SECRET` auth + `DigestRun`-style idempotency keyed by ISO week, e.g. `2026-W30`). Per `TastingGroup` with activity in the last 7 days: coffees cupped, revealed community scores, best-calibrated cupper. Group owner/instructor gets a richer version (cohort spread). Send nothing on empty weeks. Add `Profile.notificationPrefs Json @default("{}")` **now** — this is the one tiny schema touch worth pulling forward, because retrofitting email consent after over-mailing a 40-person community where everyone knows the founder costs unrecoverable trust. Surface on the existing profile page.
4. **Tasting diary upgrade** on `/app/profile/history`: filters (origin, process, score range, format), search, CSV export. Pure UI over `UserCoffeeHistory` + `Evaluation`.
5. **Richer coffee pages**: when `resultsPublished`, show community score, n, std deviation, `FlavorCloud`, `DescriptorFrequency`, radar. Enforce a **minimum-n threshold** (suggest n ≥ 3) below which the page shows only the viewer's own history. A coffee page with no community data must still be useful single-player.
6. **QR code on invite links** (session + group invites): one component, renders the existing token URL. Ship with the waiting-room flow. This is the classroom-projector join.
7. **Seeding (founder ops, not code)**: publish 50–100 reference `Coffee` records (LatAm lots, varieties, processes); schedule the first founder-hosted open calibration cupping as an `isAsync` group session; publish 2–3 exemplar reports as "catas de referencia." Track "atomic networks activated" in a spreadsheet; concierge every first group session personally.
8. **Metrics page** in the existing `/app/insights` area (§5) — one day of work, all queries over existing columns.

**Sequencing note:** ship 1–2 before 3 — a digest of an empty feed is worse than no digest.

### NEXT — small schema additions (1–2 migrations, each additive)

1. **`ActivityEvent` table** — the first true social primitive:
   ```prisma
   model ActivityEvent {
     id         String   @id @default(cuid())
     actorId    String
     verb       String   // 'evaluation_submitted' | 'session_closed' | 'results_published' | 'coffee_published' | 'group_session_created'
     objectType String
     objectId   String
     sessionId  String?
     groupId    String?
     visibility String   // 'private' | 'group' | 'public'
     createdAt  DateTime @default(now())
     @@index([groupId, createdAt(sort: Desc)])
     @@index([actorId, createdAt(sort: Desc)])
   }
   ```
   Emit one `create()` from the tail of existing server actions only (`submitEvaluation`, `closeSession` in `app/actions/community.ts`; publish toggles in `app/actions/coffees.ts`). Rules: never emit for `isDraft=true` (mirror the trigger's semantics — emit on the `isDraft=false` transition); stamp `visibility` at write time from object state (group session → `'group'`, solo → `'private'`, published coffee → `'public'`); when a coffee is unpublished, `updateMany` its events back to `'private'`; no backfill — the log starts at launch. Query-time (pull) feed: one `findMany` with `OR: [{visibility:'public'}, {groupId: {in: myGroupIds}}]` — fan-out-on-read is correct until ~50k rows or p95 > 100ms (write this trigger condition into an ADR so nobody prematurely builds fan-out). Dashboard swaps "recent sessions" for this feed. RLS backstop appended to `prisma/sql/rls_and_triggers.sql` (manual apply, per project workflow): actor sees own; `public` visible to all; `group` gated on membership EXISTS.
2. **`Notification` table + bell** — recipient-centric, separate from the actor-centric event log:
   ```prisma
   model Notification {
     id        String    @id @default(cuid())
     userId    String
     type      String    // 'session_invite' | 'results_ready' | 'joined_your_session' | 'group_added'
     payload   Json
     readAt    DateTime?
     emailedAt DateTime?
     createdAt DateTime  @default(now())
     @@index([userId, readAt])
     @@index([userId, createdAt(sort: Desc)])
   }
   ```
   Minted in the same server actions (`closeSession` → one row per joined `SessionParticipant`). Live unread badge via Supabase Realtime using the documented no-filter-string + client-side-filter pattern from the evaluations subscription. Only direct, actionable events mint rows — everything else stays in the digest. `emailedAt IS NULL` is the digest sweep marker: the same table drives bell and email with no queue. Two-lane email policy: immediate sends (via Resend, synchronous in the action) for `session_invite` and `results_ready` **only**; everything else batches weekly.
3. **Comments on closed sessions and published evaluations** (`Comment { id, authorId, targetType, targetId, body, createdAt, hiddenAt? }`). Post-reveal only, group-scoped, session owner can hide. This is where "yo encontré fruta de hueso donde tú encontraste cítricos — ¿mismo lote?" lives — calibration conversation, the profession's highest-value discussion. No open public commenting yet.
4. **One respectful reaction** ("Bien catado" — a cupping-spoon icon) on feed items and published evaluations. Single reaction type, visible to group members, **no public counts on profiles**. Peer signal, not vanity metric.
5. **Public profile route** (opt-in): level, session count, calibration index (rolling deviation across last N group sessions), flavor fingerprint, groups. This is where shared certificates link to, and the future follow target.
6. **Trust & safety floor — ship in the same milestone as any publicly discoverable content, not after**: `Report { reporterId, targetType, targetId, reason, status, resolvedBy?, createdAt }` with a report button on public surfaces; `hiddenAt/hiddenBy` soft-hide columns on `Coffee` and `Profile` (never hard-delete a professional's evaluation data over a dispute); admin review list under the existing `analyticsAccess`-gated insights area (no new RBAC); a short es/en community-norms page (conducta profesional, no puntajes fabricados, respeto a datos no publicados). Defer blocks until there's a user-to-user contact surface beyond shared sessions. Artisanal moderation is correct at this scale; escalate only on the first spam wave.
7. **Exploration badges** (deliberately last in Next): origins cupped, processes evaluated, flavor-wheel leaves identified, formats mastered, sessions hosted. Visible unearned badges for completionist pull. **No streak, volume, or frequency badges — ever** (§4).
8. **Follow graph — designed, not built.** Write the feed's audience clause as an array of OR conditions so `followeeId IN (...)` slots in later as one more clause. Single asymmetric table (`Follow { followerId, followeeId, @@id([followerId, followeeId]) }`), Strava-style not LinkedIn-style, added only when there are notable strangers worth following. It's a 30-minute migration when the day comes precisely because visibility is stamped per-event from day one.

### LATER — trust-signal and marketplace ambitions (gated on density)

1. **"Cata Verificada" badge**: a session earns it when it meets published, auditable criteria (≥5 participants, blind until reveal, ≥3 cups/sample, ≥1 credentialed cupper). The coffee page then shows *comunidad 86.4 · n=7 catadores · desv. est. 0.9* plus the consenting roster. We control the whole procedure server-side — blind labels, per-cupper submissions, trigger-computed aggregate — so we can attest what self-reported marketplace scores never can. This attacks the documented score-inflation problem (importers +1–5, roasters +1–3) as the "everyday Cup of Excellence."
2. **Producer claim flow on `Coffee`**: provenance story fed from `ExtrinsicData`, verified community score, share link, embeddable score widget, QR for sample bags — the score travels with the sample instead of dying inside a buyer's Cropster account.
3. **Distributed same-lot calibration rounds**: exporter sends one lot to 6 labs with one invite link; each cups blind within an `isAsync` window; at `closesAt`, cross-lab consensus + per-lab deviation. ~90% exists (`createGroupSession` + `SessionInvite` + `closesAt` + trigger); new work is framing, per-lab grouping in results, and inviting whole `TastingGroup`s as units.
4. **Structured sample-feedback to origin**: with per-evaluation consent, a claimed coffee's producer receives the aggregated sensory profile from prospect roasters' blind evaluations ("4/5 compradores encontraron fruta de hueso") — the Algrano feedback loop, but structured and portable. This is the wedge for marketplace partnerships (embedding verified scores) rather than competing on logistics.
5. **Cupper reputation passport**: public profile as a living portfolio (evaluations, level, percentile, calibration index, self-declared credentials with later verification). **Display, never weight** — CVA treats cuppers equally; weighting the aggregate would break both the SCA alignment and the procedural-trust claim.
6. **"Tu Año en Cata"** (ship for December 2026), self-set annual cupping goal ("Meta 2027: 120 cafés," auto-tracked), curated lists/"flights" (an instructor's "10 cafés para aprender lavado vs. natural," a roaster's seasonal lineup).
7. **Diligence item, before any of the above ships publicly**: review the SCA official-digital-platform licensing program (Tastify and CatadorCVA are licensed) and confirm what CVA-branded claims require.

---

## 4. What NOT to Build

These would actively cheapen a professional tool. Treat as standing product law:

1. **No streak, volume, or frequency badges** ("100 catas," daily streaks). Documented compulsion mechanics; reads as gimmick to professionals. Exploration and skill only.
2. **No public global score leaderboards.** Invites gaming and score inflation, violates blind-protocol culture. Status stays anchored to the local reference group — your table of 8, your cohort of 25 ("quedaste 3° en calibración en tu mesa" is meaningful; a global rank at N=30 is embarrassing).
3. **No global timeline / follower feed in v1.** An empty feed signals a dead platform. Scoped surfaces only (session, group, coffee) until groups routinely produce 10+ items/week.
4. **No follower counts or vanity metrics on profiles.** Reaction totals stay off profiles; the profile's numbers are professional (evaluations, calibration, level).
5. **No algorithmic feed ranking, no ads, ever.** Chronological, scoped, honest. Community trust IS the product.
6. **No celebrity-expert content architecture.** The Delectable death spiral: don't build around star Q-graders as content suppliers, and never paywall the substance of community evaluations. Instructors get curation and leadership tools (cohorts, dashboards, certificates), not a broadcast pedestal.
7. **No gating solo value behind the network.** Solo sessions, offline evaluation, PDF export, personal history work fully with zero friends, forever.
8. **No thin aggregates.** Never show a community score below the minimum-n threshold. One bad aggregate discredits every good one.
9. **No pre-reveal social visibility.** Comments, reactions, and feed items are post-reveal/post-close, always. The blind protocol is the product's integrity.
10. **No big-bang public launch.** A broad launch scatters signups too thinly to form any atomic network. Spend this phase perfecting the table→cohort→group loop; saturate bounded populations (one lab, one cohort, one region — the Fresno strategy).
11. **No new infrastructure.** No Amplitude, no Stream/getstream, no queues, no fan-out tables. Plain Postgres rows in the existing Prisma/Supabase stack cover every primitive at this scale; the escape hatches are documented above.

---

## 5. Metrics to Instrument First

All derivable from existing columns today; build as one page in the existing `/app/insights` area (access model and chart components already there). At dozens of users, **absolute counts and named cohorts beat ratios** — the actionable output is "these five people went quiet this week," and the founder messages them.

**North star:** **weekly submitted evaluations in group sessions** — captures both engagement and the social loop in one number.

**Primary growth metric (manual for now):** **atomic networks activated per month** — groups that completed a session with 4+ submitted evaluations *and* ran a second session within 30 days. A spreadsheet and WhatsApp, not code, until it isn't.

| Metric | Definition (existing data) | Why |
|---|---|---|
| WAU (core action) | `count(DISTINCT cupperId) FROM evaluations WHERE isDraft=false AND submittedAt > now()-'7 days'` | "Active" = the core-value action, not login. WAU is the honest cadence for a business-day professional tool. |
| Activation funnel (named) | `Profile.createdAt` → `onboardingCompleted` → first `submittedAt` per cupper → first `SessionParticipant` `status='joined'` on someone else's session | The last step is the **social-activation milestone**. Show as a table with names, not percentages. |
| Time-to-first-reveal | Signup → first closed group session with the user's submitted evaluation | Instruments the magic moment; every onboarding change is judged against this. |
| Second-session rate (30d) | Groups with ≥2 completed sessions / groups with ≥1, trailing 30 days | The retention half of "atomic networks activated." |
| Contribution tiers | Creators (created sessions/coffees this month) / contributors (submitted in others' sessions) / lurkers (signed in, no submissions) | Healthy professional community ≈ 70-20-10: 12 contributors of 40 members is on-benchmark, not failure. Prevents panicking at normal participation inequality. |
| Digest engagement | Resend opens/clicks per group digest, once shipped | The digest is the feed for now; this is feed health. |
| Calibration spread per group | Std deviation of member deviations vs. `attrAverages`, per group over time | Doubles as the instructor's teaching KPI — a product metric that is also a user feature. |

**Deliberately not measured yet:** DAU, session length, follower counts, viral coefficients. Add an `ActivityEvent`-based "social actives" series only after the feed ships. Resist third-party analytics until named-cohort inspection becomes impractical — the queries above are the analytics stack at this scale.

---

*Referencias de implementación: modelos en `prisma/schema.prisma`; acciones en `app/actions/community.ts`, `app/actions/sessions.ts`, `app/actions/coffees.ts`; puntuación en `lib/scoring.ts` (el trigger es autoritativo — TypeScript solo para display); SQL manual en `prisma/sql/rls_and_triggers.sql` vía el editor SQL de Supabase; patrón Realtime sin filter-string documentado en CLAUDE.md.*