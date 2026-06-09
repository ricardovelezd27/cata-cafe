# Cata Café Sensible

A professional coffee cupping evaluation platform for specialty coffee experts (*catadores*). Implements the **SCA CVA (Specialty Coffee Association — Coffee Value Assessment)** methodology with three evaluation formats: Descriptive, Affective, and Combined.

Built with Next.js 16, Supabase, Prisma, and Tailwind CSS 4.

---

## Table of Contents

- [Overview](#overview)
  - [The Problem](#the-problem)
  - [The Solution](#the-solution)
  - [Who It's For](#who-its-for)
  - [Why Cata Café](#why-cata-café)
  - [Feature Highlights](#feature-highlights)
- [What It Does](#what-it-does)
- [How to Use the App](#how-to-use-the-app)
  - [All Users: Getting Access](#all-users-getting-access)
  - [Session Leader (Admin): Solo Cupping](#session-leader-admin-solo-cupping)
  - [Session Leader (Admin): Group Cupping](#session-leader-admin-group-cupping)
  - [Participant: Joining and Evaluating](#participant-joining-and-evaluating)
  - [All Users: Results and History](#all-users-results-and-history)
  - [All Users: Coffee Profiles](#all-users-coffee-profiles)
- [Scoring System](#scoring-system)
- [Tech Stack](#tech-stack)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Database & Supabase Setup](#database--supabase-setup)
- [Project Structure](#project-structure)
- [Dev Commands](#dev-commands)

---

## Overview

> **The professional cupping platform that keeps a Q-grader's full attention on the coffee — not the software.**

Cata Café Sensible is a web app for running rigorous, reproducible specialty-coffee evaluations the way the industry actually scores them: the official **SCA CVA (Coffee Value Assessment)** protocol, end to end. Solo or in a group, online or offline, every cup is captured, scored, and traceable — from green-bean inspection through blind tasting to the exportable certificate.

**Auténtico · Profesional · Refinado** — built for people who taste coffee for a living.

### The Problem

Professional cupping still runs on paper forms and spreadsheets. That creates real friction in the lab:

- **Manual CVA math is error-prone.** The scoring formula is fiddly, and hand-tallying uniformity and defect penalties across cups invites mistakes on results clients rely on.
- **Group calibrations are hard to aggregate.** Collecting every taster's sheet, normalizing penalties, and producing one community score is slow and inconsistent.
- **Blind integrity is fragile on paper.** Keeping sample identities hidden until the reveal — and tying results back to origin afterward — takes manual discipline.
- **Connectivity is unreliable.** Cupping labs, roasteries, and farm sites often have weak or no wifi, exactly where the data is being entered.
- **History gets lost.** Last quarter's score for the same lot lives in a folder somewhere, disconnected from the coffee itself.

### The Solution

Cata Café Sensible replaces the paper sheet with a purpose-built tool:

- The **complete SCA CVA protocol** — Descriptive, Affective, and Combined formats — with scores computed automatically and the formula shown transparently.
- **Solo and group sessions**, with invite links, real-time submission tracking, and a single authoritative **community aggregate score**.
- **Offline-first cupping**: evaluate with no connection, and drafts sync automatically — with conflict resolution — the moment you're back online.
- **Blind by design**: coded sample labels, origin data entered only after the reveal.
- **Full traceability**: every revealed sample feeds a coffee profile and a personal tasting history.
- **Exportable PDF certificates** for records and clients.

### Who It's For

| Persona | Role | What they need |
|---|---|---|
| **Q-Grader / Trained Cupper** | Runs formal evaluations in a lab or roastery | Fast, reliable data entry during a timed protocol; precise, transparent scoring; green-bean and post-reveal data capture; PDF export |
| **Session Organizer / Lab Manager** | Sets up sessions, invites cuppers, manages reveals | Solo or group sessions with format choice; blind sample control; live submission progress; community aggregate scoring; shareable invites |
| **Invited Participant** | Joins a group session via link | A frictionless join, a clean evaluation flow, and access to aggregate results after the session closes |

Default language is **Spanish** (the working language of much of the specialty-coffee world), with full English support.

### Why Cata Café

| Value | What it means |
|---|---|
| **Protocol fidelity** | Implements the official SCA CVA formula exactly — no approximations. Penalties are normalized correctly across cups and participants. |
| **Zero-friction entry** | Auto-save at every keystroke (800ms debounce). Magic-link sign-in — no passwords to manage. |
| **Works offline** | Cup in a basement lab or on a farm with no wifi. Drafts persist locally and sync — conflict-aware — on reconnect. |
| **Real-time group calibration** | Watch submissions land live; produce one trustworthy community score the instant the session closes. |
| **Blind integrity** | Coded labels (A, B, C…); origin revealed only post-tasting, on the leader's command. |
| **Full traceability** | Every cup links to a coffee profile and a personal history with both individual and community scores. |
| **Certificate export** | One-click formatted PDF for records or clients. |
| **Bilingual, Spanish-first** | Built for Latin-American specialty-coffee professionals, with English available throughout. |

### Feature Highlights

**Solo cupping** — Create a session, inspect green beans, cup each sample across the chosen format, reveal origins, and export a certificate.

**Group cupping** — Invite cuppers by link, track who has submitted in real time, reveal samples on your command, exclude outliers from the aggregate, and close the session to lock in community scores.

**Offline-first** — Keep evaluating with no connection; a banner shows offline status and drafts replay automatically on reconnect, with a conflict modal if a draft was already submitted elsewhere.

**Guided onboarding** — First-time cuppers tell us their role and country and are routed straight to a first action (create a session or add a coffee).

**Coffee library & history** — Every revealed coffee gets a profile tracking each session it appeared in; each cupper gets a personal tasting history with individual and community scores.

**Mobile-ready** — A responsive cupping layout with mobile sample navigation, tuned for tablets and phones at the cupping table.

---

## What It Does

Cata Café Sensible allows coffee professionals to:

- Run **solo or group blind cupping sessions** following SCA CVA methodology
- Evaluate samples across **3 formats**: Descriptive (intensity + sensory descriptors), Affective (1–9 quality scores), or Combined
- Assess **green bean quality** (physical defects, screen size, color) before tasting
- Record **post-reveal origin data** (country, farm, variety, process) after blind tasting
- In group sessions: **invite participants via link**, track submission progress in real time, and compute **community aggregate scores**
- View **individual and community scores** with radar charts comparing attribute averages
- Browse a **coffee profile library** tracking every cupping session a coffee has appeared in
- Review a personal **tasting history** across all revealed coffees
- Keep cupping **offline** — drafts persist locally and sync automatically (with conflict resolution) on reconnect
- Get started fast with **guided onboarding** that captures role and country and routes to a first action

---

## How to Use the App

### All Users: Getting Access

The app uses **magic link authentication** — no passwords.

1. Go to the app URL and navigate to **Login**.
2. Enter your email address and click **Send magic link**.
3. Open the email and click the link — you are logged in automatically.
4. Your profile is created on first login. You can update your display name and preferred language from the **Profile** page.
5. On your **first login**, a short onboarding welcome captures your role (Q-grader, barista, roaster, producer, trader, or enthusiast) and country, then routes you to a first action — creating a session or adding a coffee.

> **Invited to a group session?** If someone sent you an invite link, open it directly. If you are not logged in yet, you will be redirected to the login page and then automatically returned to the invite after authenticating.

> **Cupping offline?** The evaluation interface keeps working without a connection — an offline banner appears and your scores are saved locally. When you reconnect, drafts sync automatically. If an evaluation was already submitted from another device while you were offline, a conflict dialog lets you choose what to keep.

---

### Session Leader (Admin): Solo Cupping

The session leader creates and controls all aspects of the session.

#### 1. Create a session

1. From the **Dashboard** or **Sessions** page, click **Nueva sesión**.
2. Fill in:
   - **Name** — a label for this cupping (e.g. "Lote 23 — Filtrado")
   - **Date**
   - **Objective** (optional)
   - **Format** — Descriptive, Affective, or Combined
   - **Cups per sample** — how many cups each sample is served in (affects penalty calculations)
   - **Samples** — add one row per coffee sample; each gets a blind label (e.g. "A", "B", "C")
   - Leave **Group session** toggle off for solo use
3. Click **Create session** — you land directly on the cupping interface.

#### 2. Physical evaluation (optional, pre-tasting)

Before cupping, you can evaluate the green beans:

1. On the cupping page, select a sample and open the **Physical** tab.
2. Record defects (Category 1 and Category 2), screen size, and color.
3. Save — data is persisted automatically.

#### 3. Cup the samples

1. Select a sample from the top pill navigation.
2. Open the **Cupping** tab.
3. Fill in the evaluation form according to the format:
   - **Descriptive**: intensity sliders, flavor tree, acidity/sweetness/mouthfeel descriptors, gustos predominantes
   - **Affective**: 1–9 quality scales for each of the 8 SCA CVA attributes (Fragancia, Aroma, Sabor, Sabor residual, Acidez, Cuerpo, Uniformidad, Balance)
   - **Combined**: both forms on one page
4. Mark any non-uniform or defective cups using the cup checkboxes.
5. Your score is **saved automatically** as you type (800ms debounce) — no manual save needed.
6. Navigate between samples using the pill tabs at the top.

#### 4. Reveal sample identities (optional)

After blind tasting, you can reveal what each sample was:

1. In the **Extrinsic** tab for a sample, fill in origin data (country, region, farm, producer, variety, process, certifications).
2. Data is saved and linked to the coffee profile.

#### 5. View results

1. Click **Ver resultados** from the cupping page or navigate to the session's **Results** page.
2. See per-sample scores, SCA CVA breakdown, and attribute radar charts.
3. Use **Print / PDF** to export a formatted certificate.

---

### Session Leader (Admin): Group Cupping

Group sessions add invite management, real-time progress tracking, reveal control, and community aggregate scoring on top of the solo flow.

#### 1. Create a group session

1. Click **Nueva sesión** and fill in the same fields as a solo session.
2. Toggle **Sesión grupal** on.
3. Optional group-specific settings:
   - **Asíncrona** — participants can cup at different times (no live session required)
   - **Fecha de cierre** — auto-deadline after which the session stops accepting submissions
4. Click **Create** — instead of redirecting immediately, a **Step 2** appears showing the invite link.

#### 2. Share the invite link

- Copy the invite URL shown on Step 2 (format: `/[locale]/join/[token]`).
- Send it to participants via email, WhatsApp, or any channel.
- The link can be used multiple times (no use limit by default; you can set `maxUses` when generating additional tokens via the API).
- Anyone who opens the link and authenticates becomes a **joined participant** of the session.

#### 3. Monitor progress during the session

On the cupping page, the **Master Controls panel** (visible only to the session leader) shows:

- **X / Y submitted** — live count of how many participants have submitted their evaluation for each sample. This updates in real time as participants submit — no page refresh needed.
- Per-sample **Reveal** buttons (see step 4 below).
- A **Close Session** button (see step 5 below).

#### 4. Reveal sample identities

When you're ready to reveal which coffee was which (after all or most participants have submitted):

1. In the Master Controls panel, click **Revelar identidad** next to a sample.
2. Select the coffee from the dropdown (or create a new coffee profile).
3. Confirm — the sample's coffee ID is now set and `revealed = true`.

> Revealed samples are included in coffee profiles and tasting history. Unrevealed samples are not.

#### 5. Close the session

When cupping is complete:

1. Click **Cerrar sesión** in the Master Controls panel.
2. Confirm the dialog — session status changes to `closed`.
3. This triggers `syncCoffeeHistory`: for every revealed sample, each participant's individual score and the community aggregate score are written to the **coffee history**.
4. Community results (aggregate scores, radar charts, per-participant breakdown) become visible to all participants.

---

### Participant: Joining and Evaluating

Participants follow the standard cupping flow but have a restricted view — no master controls, no reveal buttons.

#### 1. Join via invite link

1. Open the invite link shared by the session leader.
2. If not logged in, you will be redirected to login and then back to the join page automatically.
3. Click **Unirse a la sesión** — you are added as a participant and redirected to the cupping interface.

> You can only join once. Reopening the link after joining takes you directly to the cupping page.

#### 2. Cup the samples

Same flow as the session leader:

1. Select a sample from the pill navigation.
2. Fill in the evaluation form (Descriptive, Affective, or Combined — set by the session leader at creation).
3. Your work saves automatically.

#### 3. Submit your evaluation

When you are satisfied with your scores for a sample:

1. Click **Enviar evaluación** (visible in the cupping tab).
2. Confirm — your evaluation is marked as submitted (`isDraft = false`).
3. The session leader's progress counter increments in real time.

> You cannot edit a submitted evaluation. Review carefully before submitting.

#### 4. View results after session closes

Once the session leader closes the session, the **Results** page shows two tabs:

- **Mis resultados** — your individual scores per sample
- **Resultados grupales** — community aggregate scores, radar chart of attribute averages, delta (your score vs. community), and the full participant breakdown

---

### All Users: Results and History

#### Results page

- Accessible from any session card in the Dashboard or Sessions list.
- For solo sessions: individual scores and SCA CVA breakdown only.
- For group sessions (closed, or if you are the session leader): tab toggle for individual vs. group results.
- **PDF export**: click **Imprimir / PDF** to generate a formatted evaluation certificate.

#### Personal tasting history

- Navigate to **Historial** in the top nav.
- Shows every coffee you have tasted in a revealed session — coffee name, session, your individual score, community score, and date.
- Links to the coffee profile for each entry.

---

### All Users: Coffee Profiles

- Navigate to **Cafés** in the top nav.
- Lists all public coffees plus any coffees you created.
- Click a coffee to see its **profile page**: origin details (country, region, farm, producer, variety, process, certifications) and a full tasting history showing every session it appeared in along with individual and community scores.

---

## Scoring System

### Individual Score (SCA CVA)

```
S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
```

| Variable | Meaning |
|---|---|
| `hᵢ` | Final value (1–9) for each of the 8 affective attributes |
| `u` | Non-uniform cups (penalty applies only when ≥5 cups per sample) |
| `d` | Defective cups (penalty applies only when ≥5 cups per sample) |

Score range: roughly 36–100 points.

### Community Score (group sessions)

Computed by a **PostgreSQL trigger** (`trg_recompute_aggregate`) the moment an evaluation is submitted. The TypeScript `calcCommunityScore()` function is display-only.

```
uniformityPenalty = totalNonUniform × (10 / totalCups)
defectPenalty     = totalDefective  × (30 / totalCups)
communityScore    = avgRawScore − uniformityPenalty − defectPenalty
```

| Variable | Meaning |
|---|---|
| `totalNonUniform` | Cups marked non-uniform but NOT defective, summed across all participants |
| `totalDefective` | Cups marked defective, summed across all participants |
| `totalCups` | `cupsPerSample × participantCount` |
| `avgRawScore` | Average of individual raw scores across all submitted evaluations |

---

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | Next.js App Router | 16.2.4 |
| UI Runtime | React + React DOM | 19.2.4 |
| Language | TypeScript | 5 (strict) |
| ORM | Prisma + PrismaPg adapter | 7.7.0 |
| Database | PostgreSQL via Supabase | — |
| Auth | Supabase Auth (magic link OTP) | 2.104.0 |
| SSR Auth | @supabase/ssr | 0.10.2 |
| i18n | next-intl | 4.9.1 |
| Styling | Tailwind CSS 4 + PostCSS | 4 |
| Client State | Zustand | 5.0.12 |
| Offline storage | localforage (IndexedDB) | 1.10.0 |
| Charts | Recharts | 3.8.1 |
| PDF | @react-pdf/renderer | 4.5.1 |
| Primitives | Radix UI (dialog) | 1.1.15 |
| Icons | lucide-react | 1.8.0 |
| Scripts/tooling | tsx | 4.21.0 |

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works)

### Steps

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd cata-cafe
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Fill in the four required variables (see Environment Variables below)
   ```

3. **Run database migrations**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. **Apply RLS policies and triggers manually**
   - Open your Supabase project → SQL Editor
   - Run the full contents of `prisma/sql/rls_and_triggers.sql`
   - This step is required — Prisma migrate does NOT apply triggers or RLS policies

5. **Start the dev server**
   ```bash
   npm run dev
   ```
   App runs at [http://localhost:3000](http://localhost:3000). The default locale is Spanish (`/es/`).

---

## Environment Variables

Create `.env.local` at the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API (keep secret — server only) |
| `DATABASE_URL` | Supabase Dashboard → Project Settings → Database → Connection pooler (Transaction mode) |

---

## Database & Supabase Setup

### Prisma migrations (run locally)

```bash
npx prisma migrate dev        # Apply all pending migrations
npx prisma generate           # Regenerate Prisma client after schema changes
npx prisma studio             # GUI DB explorer at localhost:5555
```

### Manual Supabase steps (SQL Editor)

The following must be applied manually — Prisma cannot manage them:

- Row Level Security policies
- Trigger functions (`handle_new_user`, `recompute_aggregate_score`)
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- `ALTER TABLE evaluations REPLICA IDENTITY FULL` (required for Realtime UPDATE events)

**All of these are in `prisma/sql/rls_and_triggers.sql`.**  
Open Supabase → SQL Editor → paste and run the file contents.

### Auth configuration (Supabase Dashboard)

1. Go to **Authentication → Providers → Email** and ensure **magic links** are enabled.
2. Go to **Authentication → URL Configuration** and add your site URL and redirect URL:
   - Site URL: `http://localhost:3000` (dev) or your production URL
   - Redirect URLs: `http://localhost:3000/auth/callback`, `https://your-domain.com/auth/callback`

### Realtime configuration

1. Go to **Database → Replication** in the Supabase dashboard.
2. Enable Realtime for the `evaluations` table (the `REPLICA IDENTITY FULL` SQL handles the row data; this step enables the channel subscription).

---

## Project Structure

```
cata-cafe/
├── app/
│   ├── [locale]/
│   │   ├── app/                        # Authenticated routes (auth guard in layout)
│   │   │   ├── page.tsx                # Dashboard
│   │   │   ├── coffees/
│   │   │   │   ├── page.tsx            # Coffee list
│   │   │   │   └── [id]/page.tsx       # Coffee profile + tasting history
│   │   │   ├── profile/
│   │   │   │   ├── page.tsx            # User profile
│   │   │   │   └── history/page.tsx    # Personal tasting history
│   │   │   └── sessions/
│   │   │       ├── page.tsx            # Sessions list (own + joined)
│   │   │       ├── new/                # Create session wizard
│   │   │       └── [id]/
│   │   │           ├── cup/            # Cupping interface
│   │   │           ├── results/        # Scores & analysis
│   │   │           └── print/          # PDF export
│   │   ├── join/[token]/page.tsx       # Invite join page (no auth guard)
│   │   └── auth/login/                 # Magic link login (supports ?next=)
│   ├── actions/
│   │   ├── auth.ts                     # signInWithMagicLink, signOut
│   │   ├── sessions.ts                 # createSession, createGroupSession, upsertEvaluation...
│   │   ├── community.ts                # submitEvaluation, closeSession, revealSample, joinViaToken, excludeParticipant...
│   │   ├── coffees.ts                  # Coffee profile create/update
│   │   ├── offline.ts                  # Conflict-aware replay of offline drafts on reconnect
│   │   ├── profile.ts                  # Profile updates, completeOnboarding
│   │   └── dev.ts                      # Dev-only helpers
│   └── auth/callback/route.ts          # Supabase OAuth callback
├── components/
│   ├── cupping/                        # All evaluation UI components
│   ├── results/                        # Score tables, radar charts, descriptor frequency
│   ├── offline/                        # OfflineBanner, SyncConflictModal, OfflineFirstLoadError
│   ├── onboarding/                     # WelcomeModal, OnboardingWrapper
│   └── ui/, layout/, dashboard/        # Shared atoms, shell, dashboard widgets
├── hooks/
│   ├── useConnectivity.ts              # Online/offline detection
│   └── useOfflineSync.ts              # Drains the offline draft queue on reconnect
├── lib/
│   ├── prisma.ts                       # Prisma singleton
│   ├── scoring.ts                      # SCA CVA formula
│   ├── evaluation.ts                   # Derived-score computation shared by live + offline paths
│   ├── constants.ts                    # Flavor tree, attributes, defect categories
│   ├── descriptors.ts                  # Descriptor helpers
│   ├── offline/
│   │   ├── store.ts                    # localforage/IndexedDB draft store (client-only, SSR-safe)
│   │   └── types.ts                    # Offline blob + sync-status types
│   └── supabase/
│       ├── client.ts                   # Browser client (Realtime + offline)
│       ├── server.ts                   # Cookie-based client (SSR)
│       └── admin.ts                    # Service-role client (server only)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── sql/rls_and_triggers.sql        # Apply manually via Supabase SQL editor
├── messages/
│   ├── es.json                         # Spanish (default)
│   └── en.json                         # English
└── proxy.ts                            # Middleware (Next.js 16 — must be proxy.ts)
```

---

## Dev Commands

```bash
npm run dev          # Start dev server → http://localhost:3000
npm run build        # Production build (runs prisma generate first)
npm run lint         # ESLint

npm run seed:test            # Seed test users (scripts/seed-test-users.ts)
npm run verify:group-average # Verify group-average scoring (scripts/verify-group-average.ts)

npx prisma migrate dev      # Apply pending migrations
npx prisma generate         # Regenerate client after schema changes
npx prisma studio           # DB GUI explorer
```
