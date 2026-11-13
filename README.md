# Cata Café Sensible

A web app for running coffee cupping sessions (*catas*) the way specialty-coffee professionals score them. It follows the **SCA CVA (Specialty Coffee Association, Coffee Value Assessment)** form, offers three evaluation formats (Descriptive, Affective and Combined), and works for one person alone or for a group tasting together or each at their own pace.

Built with Next.js 16, Supabase, Prisma and Tailwind CSS 4. The interface is Spanish first, with English available throughout.

This README describes the code on `main`. Where something has been built but never exercised against the real production service, it says so.

---

## Table of Contents

- [Overview](#overview)
- [What It Does](#what-it-does)
- [How to Use the App](#how-to-use-the-app)
  - [Signing in, guests and accounts](#signing-in-guests-and-accounts)
  - [Starting a session](#starting-a-session)
  - [Cupping](#cupping)
  - [Group sessions: the organizer](#group-sessions-the-organizer)
  - [Group sessions: a participant](#group-sessions-a-participant)
  - [Closing a session](#closing-a-session)
  - [Results, reports and exports](#results-reports-and-exports)
  - [Coffees](#coffees)
  - [Tasting groups](#tasting-groups)
  - [Sensory warm-up](#sensory-warm-up)
  - [Insights (restricted)](#insights-restricted)
  - [Profile and account](#profile-and-account)
- [Scoring System](#scoring-system)
- [Tech Stack](#tech-stack)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Database and Supabase Setup](#database-and-supabase-setup)
- [Tests](#tests)
- [Project Structure](#project-structure)
- [Dev Commands](#dev-commands)
- [Further Documentation](#further-documentation)

---

## Overview

### The problem

Professional cupping still runs on paper forms and spreadsheets:

- The CVA arithmetic is easy to get wrong by hand.
- Collecting every taster's sheet and producing one group result is slow.
- Keeping sample identities hidden until the reveal, and tying results back to the coffee afterwards, takes manual discipline.
- Cupping rooms, roasteries and farms often have weak or no connection.
- Last quarter's score for the same coffee ends up in a folder, disconnected from the coffee.

### What the app does about it

- It captures the CVA evaluation on a phone or tablet and computes the score for you, showing the formula.
- A session can be solo, a live group (everyone cups together, with a waiting room), or a self-paced group with a closing date.
- A cupper can keep evaluating without a connection. Drafts are stored on the device and sync when the connection returns.
- Samples are blind (coded labels) until the organizer reveals which coffee each one was.
- Every revealed coffee gets a profile, and every cupper keeps a personal tasting history.
- Results can be exported as PDFs; the session organizer can also download a CSV.

### Who it is for

| Role | What they do in the app |
|---|---|
| **Cupper** (Q-grader, roaster, barista, producer, enthusiast) | Evaluates samples, reads results, keeps a history |
| **Session organizer** | Creates sessions, invites cuppers, controls the reveal and the close, and sees the per-cupper breakdown |
| **Guest** | Joins a group session by scanning a QR code with just a name, cups, and can later keep the results by creating an account |
| **Restricted analytics users** | A small set of people who can open the Insights area (see [Insights](#insights-restricted)) |

Product principle (see `PRODUCT.md`): *valor antes que fricción* — ask for as little as possible before the person gets value. That is why a guest needs no email and why creating a session only requires a name.

---

## What It Does

- Runs **solo, live-group and self-paced group** cupping sessions, plus a three-tap quick start ("Catar ahora").
- Supports three **formats**: Descriptive (intensities and sensory descriptors), Affective (1–9 quality ratings of eight attributes) and Combined.
- Records an optional **green-bean (physical) assessment** and **origin data** that the organizer can fill in around the reveal.
- Lets the organizer mark up to three samples as a **reference** that the other samples are compared against.
- Computes **individual and community scores**, a consensus figure, and ranks the samples with labels that say when a number is only indicative.
- Keeps working **offline** and syncs drafts on reconnect.
- Builds a **coffee library** (short codes, visibility, sharing) and a personal **tasting history**.
- Manages **tasting groups**: a standing roster of co-cuppers, an announcements feed, and group emails.
- Offers a guided **sensory warm-up** ("Movimiento sensorial") before cupping.
- Produces **PDFs** (CVA form, personal summary, technical sheet, coffee sheet) and, for organizers, a **CSV** of the per-cupper data.
- Sends email: sign-in links and codes, group announcements, session-close emails with a results link and a personal summary PDF, and deadline reminders.

---

## How to Use the App

### Signing in, guests and accounts

There are no passwords. There are three ways in:

1. **Email.** On the login screen, enter your address and choose "Enviar enlace". The email contains a link and a 6-digit code. Either works: open the link, or type the code on the login screen ("Entrar con el código").
2. **Google.** "Continuar con Google". (Google sign-in does not work inside some in-app browsers; the login screen says so and offers to copy the link.)
3. **Guest, by QR or invite link.** A group session's join page offers "Continuar como invitado": only a display name, no email.

How the email link behaves:

- Opening the link does **not** sign you in by itself. It lands on a confirmation page (`/auth/confirm`) with an "Entrar" button; pressing it completes the sign-in. This is so email security scanners that open links cannot use up your one-time link.
- If you open the link in a **different browser than the one that requested it** (for example, you asked for the link on a laptop and open the email on a phone), the app does not sign you in silently. It shows "Vas a entrar como …" with the full address and two buttons, "Sí, continuar" and "No soy yo". This check has been exercised in production only for the same-browser case; the different-browser case has not been tried against the real service.
- Links work once and expire; a failed link offers to request a new one.

On the first sign-in a short welcome asks for your role and country and points you to a first action (create a session or add a coffee). You can skip it.

**Guests** can join, cup, and read the results of the sessions they joined, and see their own profile. They cannot create sessions, coffees or groups, send invitations or use the Insights area; tapping one of those opens a "Termina de crear tu cuenta" dialog. A guest's access is tied to that browser: clearing site data or switching device loses it.

**Keeping a guest's results.** On a results page a guest sees a banner with "Crear cuenta y guardar". It sends them through the normal sign-in (email or Google), then to a confirmation card ("Vincular tus resultados") that names the guest participation. Only when the guest presses "Vincular a mi cuenta" are the evaluations and history moved to the account, whether the account is new or already existed. The link is valid for 7 days.

### Starting a session

From the dashboard or the **Sesiones** page:

- **"Catar ahora"** (quick start): a name, a format and 1–20 samples, nothing else. It creates a solo session with one cup per sample and samples that have no coffee attached yet (labels "Muestra A", "Muestra B"…). You can name the coffees at the end or after the session closes. Registered users only.
- **"Nueva sesión"** (full wizard):
  - **Name** and **date** (required name), optional **objective**.
  - **Format**: Descriptivo, Afectivo or Combinado.
  - **Cups per sample**: 1 to 5.
  - **Samples**: one row each, with a blind label and a coffee, either one from your library or a new one created together with the session (only the coffee's name is required; altitude, roast and the rest can be filled in later). A coffee created this way is saved in the same step as the session, so a failed save leaves no stray coffee.
  - Optionally one sample marked as the **Referencia** (see below).
  - **"Sesión grupal"** switches on the group options: **"Asíncrona"** (self-paced) and **"Fecha de cierre"** (closing date). Setting a date makes the session self-paced: no waiting room and no "Iniciar cata". Leave the date empty for a live cupping that you close yourself.
  - A group session has a second step that shows the invite link and a QR code.
- **Duplicate** an existing session as a template.

The organizer can later edit the session, add, rename or remove samples, change the reference, and (for a group session) change or clear the closing date, as long as the session is not closed. The warm-up exercise can only be chosen before the session starts or anyone evaluates.

**Reference sample ("Referencia").** The organizer can mark one sample as the control that the others are compared against, and up to three over time (each new one becomes the active reference; the earlier ones keep their data but are no longer fixed). The reference is cupped first. In affective and combined formats the active reference's quality is fixed at 5 ("ni alto ni bajo") on all eight attributes, so every cupper's score for it is exactly 79.00 and cuppers only describe what they perceive. On the results page the reference is shown as an anchor above the ranking, is left out of the ranking, the session average and "Mejor muestra", and every other sample shows a signed **Δ** against it (the "Comparar con" selector chooses which reference to compare against). The reference never changes any score; it only gives context.

### Cupping

The cupping screen has a sample navigator, the evaluation form and, for the organizer, a control panel ("Panel de maestro") in group sessions.

- **Descriptive:** intensity sliders, a flavor-wheel picker (browse the hierarchy or type and get fuzzy matches that tolerate typos and accents, with the breadcrumb shown), acidity, sweetness and mouthfeel descriptors, and main tastes.
- **Affective:** 1–9 ratings of eight attributes: Fragancia, Aroma, Sabor, Sabor residual, Acidez, Dulzor, Sensación en boca and Impresión global.
- **Combined:** both on one page.
- **Cups:** for each cup you can mark it non-uniform or defective. A defective cup is also counted as non-uniform. Each marked cup costs points at any number of cups (see [Scoring](#scoring-system)); with a single cup uniformity is not evaluated.
- **Físico (physical) and Extrínseco (origin) modules:** green-bean defects, screen size, color, and origin data (country, farm, variety, process…). These are per sample, not per cupper, so only the session owner edits them; participants do not see the physical data, and the origin data is shown only to the owner or once the sample is revealed.
- **Notas rápidas:** an optional last step with a free-text note per sample. It is never part of the score.
- Your work **saves itself** a moment after you stop typing. The indicator says "saved" only when the server has it; if you are offline or the write failed it says the note is saved on this device and pending sync.
- **Offline:** the page keeps working without a connection. Drafts live in the browser's IndexedDB and are sent when you reconnect. If an evaluation was already submitted (for example from another device) while you were offline, a conflict dialog lets you choose what to keep. A service worker (production builds only) lets the app shell reopen offline. Drafts that cannot be synced (for example because the session closed meanwhile) are listed in a "Notas sin sincronizar" panel where you can read and copy them; nothing is deleted automatically.
- **Submitting:** "Enviar evaluación" per sample, or "Enviar y ver resultados" at the end. In a group session the organizer sees a live count of how many cuppers have submitted everything.

### Group sessions: the organizer

- **Invite** by link or QR (`/join/[token]`). The organizer can regenerate the link ("Regenerar enlace", which invalidates the old one and its QR), and "Cerrar entradas" so that only people already in can enter.
- **Live group:** participants who arrive wait in a waiting room until the organizer presses **"Iniciar cata"**, which can be done on the second wizard step or from the control panel. If the session is linked to a tasting group and the organizer asked to notify it, the group is emailed when the cupping starts (self-paced sessions notify at creation).
- **Self-paced group:** with a closing date there is no waiting room; each cupper evaluates whenever they like until the date.
- **Reveal:** "Revelar identidad" attaches the real coffee to a blind sample. Revealed samples feed coffee profiles and histories.
- **Exclusion:** the organizer can exclude a cupper from the results (with a reason). The cupper still sees their own results; the community numbers recompute without them.
- **Control panel extras:** change the reference, start the group warm-up together, see who has unsent complete notes before closing.

### Group sessions: a participant

Open the invite link or scan the QR; sign in or "Continuar como invitado". You land in the waiting room (live) or straight in the cupping screen (self-paced, or a live session already started). A participant sees no control panel and no reveal buttons. If the organizer chose a reference, its tab shows a "Referencia" pill and the others suggest comparing with it.

Results of a group session are visible to a participant once the session is closed, once everyone has submitted, or once the closing date has passed; the organizer can see them at any time.

### Closing a session

- **Solo:** the session closes itself when every sample has a submitted evaluation. "Terminar cata" closes it early: it submits your complete drafts, removes samples with no evaluation, and closes.
- **Group:** the organizer closes it with "Cerrar sesión", or the daily job closes a session whose closing date has passed (see [Scheduled jobs](#scheduled-jobs)). The dialog warns how many cuppers have complete notes that were never submitted: at close, those notes are **left out** of the results.
- **What closing does**, in one routine: the session becomes read-only; every sample that has a coffee linked is revealed; community scores are recomputed; each cupper's coffee history is written; and for a group session each participant with an email address is emailed a link to the results plus a personal summary PDF. If a later step fails, the close is marked unfinished and retried automatically (by the daily job, by an owner action, or when a solo owner opens the results).
- **Read-only:** a closed or expired session accepts no new evaluations. The few things that can still be changed are: the owner editing a revealed sample's origin data, the owner excluding or re-including a cupper (the results then say "Resultados actualizados el …"), and the owner attaching a coffee to a sample that had none (which also reveals it).

### Results, reports and exports

The results page (`/app/sessions/[id]/results`) is one page with three tabs, the same for everyone; owner-only content is hidden from others inside the tabs.

- **Resumen:** a dashboard with the ranking (community score in a group session, your own score in a solo session, with a "± X.X" consensus chip), your performance against the community, and a one-line descriptor summary per sample.
- **Resultados:** a table or chart view (Tabla / Gráfico), and for the owner a per-cupper CVA matrix with the exclusion switches and a standard deviation column.
- **Descriptores:** word cloud, frequency bars and consensus sentences, filterable by sample and by perceptual block.
- **Ranking honesty:** community numbers are shown as "n de N incluidos". Equal scores share a rank; with fewer than 5 cuppers the score is labelled "indicativo"; with fewer than 3 there is no spread and no "best sample"; samples whose gap is within the spread are marked "sin diferencia clara". These labels are display only and never change a score.
- A collapsible "¿Cómo se calculó?" panel breaks down how a score was computed.
- **PDFs** ("Descargar PDF" and related links): the CVA form for a session, a personal summary, a technical sheet for the owner, and a coffee sheet. They carry a stamp with the generation date, the language, how many cuppers the group numbers include, and a note when results or origin data changed after the close. A printable HTML version of the CVA form is also available.
- **CSV** ("Datos por catador (CSV)"): per-cupper data, for the session owner only.

### Coffees

- The **Cafés** page lists coffees you own and coffees shared with you or public. Each coffee has a unique 6-character **short code** (for example `K7M-3FP`) that you can quote to others and search for in the coffee picker.
- **Visibility** is private, shared (with people you invite or who open your invite link) or public. The owner can also choose whether the community results on the coffee page are visible to others.
- A coffee's page shows its origin data and every session it appeared in, with individual and community scores. Only sessions that are closed and revealed contribute, so a blind coffee is not given away before its reveal.
- **Deleting a coffee** anonymizes it rather than erasing it: identifying fields are wiped and it disappears from lists, while the tasting data attached to it stays for analysis. Only the owner can do this.
- Coffees can be duplicated, and an existing coffee can be linked to a sample from the session wizard, the session edit form, or the sample editor on the cupping page.

### Tasting groups

A **Grupo** is a standing roster of co-cuppers, separate from any one session. The owner creates it, adds members by email or from people they have cupped with, renames members, resends invitations, and posts announcements to a feed. Members can read the feed and leave the group. The owner can email the whole group and can link a session to a group so members are notified.

Group emails carry an unsubscribe link (and the standard one-click unsubscribe header); a member who opts out stops receiving that group's emails but keeps seeing the group in the app. Outbound email is rate limited, and the app tells the sender when a send was refused for that reason.

### Sensory warm-up

"Movimiento sensorial" is a library of five guided warm-up exercises with an animated figure, optional sound cues, and optional spoken narration ("Leer en voz alta"). It is in the sidebar under Sesiones (on phones, reached from the dashboard and the Sesiones page). A session owner can choose an exercise in the session wizard or edit form; cuppers who have not evaluated yet are offered it when they open the cupping screen. In a live group session the organizer can start it for everybody at once ("Empezar con el grupo").

The group synchronized run, and the audio and narration on real phones, have not been verified on two physical devices.

### Insights (restricted)

The "Análisis" area (`/app/insights`) appears only for people granted access. There are three levels:

| Level | Granted by | Sees |
|---|---|---|
| Super-admin | the `ANALYTICS_SUPER_ADMIN_EMAIL` setting (required in production; no address is built into the code) | Everything: platform-wide data, the access list, the monthly digest |
| AI admin | the `ANALYTICS_AI_ADMIN_EMAILS` allowlist | The insights pages, the AI chat, and the Usuarios directory (emails masked) |
| Flagged user | a flag on their profile | The base insights page, scoped to their own data |

Everyone except the super-admin sees only their own data. In platform scope, cuppers appear as anonymous "Catador XXXX" labels. The AI features call Google Gemini with aggregated numbers only. A monthly digest email goes to the super-admin. Insights shows derived numbers next to reference datasets with their required attribution lines.

### Profile and account

The profile page holds your display name, language, role and country, your sessions, coffees and groups, an activity-points level, and tools to change your email address, sign out on this device or everywhere, and (for guests) finish creating an account.

**Account deletion** is built (with a typed confirmation) but **disabled**: it appears only when the server setting `ACCOUNT_DELETION_ENABLED=1` is on, and it has never been run against real data. It should be rehearsed on a throwaway account first (`docs/LAUNCH-RUNBOOK.md` §24).

**Legal pages** (`/privacidad`, `/terminos`) exist as unpublished drafts. Nothing links to them until the owner pastes the final text and switches `LEGAL_PAGES_PUBLISHED` in `lib/legal/config.ts`.

### Scheduled jobs

Two jobs are registered in `vercel.json` and protected by `CRON_SECRET`:

| Path | Schedule (UTC) | What it does |
|---|---|---|
| `/api/cron/close-expired-sessions` | every day, 06:00 | Closes active sessions whose closing date has passed, finishes closes that were left unfinished, and sends a 24-hour deadline reminder and (for a live session forgotten open) an idle reminder. It never closes a session through a reminder. |
| `/api/cron/insights-digest` | the 1st of each month, 12:00 | Sends the monthly insights digest to the super-admin |

A closing date means the end of that day in the time zone of the browser that set it, so the job closes the session in the early hours after that day.

---

## Scoring System

This section describes what the code does **today**.

### Individual score (one cupper, one sample)

```
S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
```

| Symbol | Meaning |
|---|---|
| `hᵢ` | the final 1–9 value of each of the eight affective attributes |
| `u` | number of cups marked non-uniform |
| `d` | number of cups marked defective |

- Every attribute at 1 gives 58.00, at 5 gives 79.00, at 9 gives 100.00.
- The deductions of 2 per non-uniform cup and 4 per defective cup apply at **any number of cups** (a cupper never has more than five, so the deduction is the flat CVA amount). With a single cup uniformity does not exist: it is neither counted nor deducted, and a defective cup costs 4.
- A defective cup is also marked non-uniform, so it costs 6 in total (never more than 6 per cup).
- The result is rounded to the nearest 0.25 and kept between 0 and 100.

### Community score (a group's score for one sample)

Averaging the cuppers' raw scores (the formula above without the cup deductions) and then deducting the cups of everyone included, shared out beyond five pooled cups:

```
factor            = 5 ÷ max(5, totalCups)
uniformityPenalty = 2 × totalNonUniform × factor
defectPenalty     = 4 × totalDefective  × factor
communityScore    = avgRawScore − uniformityPenalty − defectPenalty
```

| Symbol | Meaning |
|---|---|
| `avgRawScore` | average of the included cuppers' raw scores |
| `totalNonUniform` | non-uniform cups across included cuppers with two or more cups (defective cups included, since a defective cup is also non-uniform) |
| `totalDefective` | defective cups across included cuppers |
| `totalCups` | the sum of the cups of the included evaluations (`Evaluation.cups`) |

- Only **complete** evaluations (all eight attributes rated) from non-excluded cuppers are included.
- Up to five pooled cups the deduction is the flat CVA amount; beyond five it is diluted (10 pooled cups: half; 40: an eighth).
- A defective cup is counted in both totals and costs 4 + 2 = 6, the same as in that cupper's individual score. Example: 4 cuppers with 2 cups each and one defective cup: that cupper loses 6, the session loses 6 × 5/8 = 3.75.
- The result is rounded to the nearest 0.25 and kept between 0 and 100.
- The authoritative value is computed by a PostgreSQL trigger (`trg_recompute_aggregate`) when an evaluation is submitted and stored in `aggregate_scores`. The TypeScript `calcCommunityScore()` is only for display, and a test keeps the two in agreement.

### Other numbers

- **Consensus (SD):** the "± X.X" next to the community score is the population standard deviation of the included cuppers' individual scores; it is `null` for fewer than two cuppers. Display only.
- **"Impresión rápida":** a session with exactly one cup per sample is tagged this way in the tasting history and on the coffee page, because its score is not a full CVA score.
- **Reference sample:** pinned at 79.00 as described above; never read by scoring.

> **Rule of 2026-11-12 (S10 WP1a).** The score that existed before S8 was right in principle and had three bugs; this is that score with the bugs fixed (a cupper under five cups saw no deduction, a group under five pooled cups had its deduction amplified, a defective cup was counted twice in the group). The specification is `docs/product/cata-descentralizada-puntaje.md`. The database function (PHASE 26) and the `evaluations.cups` column are applied by the owner (runbook §30); no stored score is recomputed and past results render unchanged (the rule version is read from the data: `evaluations.cups` NULL and `aggregate_scores."ruleVersion"` 1 mean the rule before 2026-11), until a sample is re-fired, which recomputes it under the current rule. The coffee lifetime score arrives in a later S10 PR.

---

## Tech Stack

Versions are the ones installed from `package-lock.json`.

| Layer | Library | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.4.6 |
| UI runtime | React + React DOM | 19.2.4 |
| Language | TypeScript (strict) | 5.9.3 |
| ORM | Prisma + `@prisma/adapter-pg` | 7.7.0 |
| Database | PostgreSQL via Supabase | — |
| Auth | Supabase Auth: email link and 6-digit code, Google, anonymous guests (`@supabase/supabase-js`) | 2.104.0 |
| SSR auth | `@supabase/ssr` | 0.10.2 |
| i18n | next-intl | 4.14.10 |
| Styling | Tailwind CSS (PostCSS) | 4.2.3 |
| Client state | Zustand | 5.0.12 |
| Offline storage | localforage (IndexedDB) | 1.10.0 |
| Flavor search | Fuse.js | 7.4.2 |
| Charts | Recharts | 3.8.1 |
| PDF | `@react-pdf/renderer` | 4.5.1 |
| Dialogs | Radix UI Dialog | 1.1.15 |
| Icons | lucide-react | 1.8.0 |
| Animation | GSAP (landing page text reveals) | 3.15.0 |
| QR codes | qrcode.react | 4.2.0 |
| AI (insights only) | `@google/genai` (Gemini) | 2.12.0 |
| Email | Resend (HTTP API, no SDK dependency) | — |
| Tests | Vitest | 3.2.7 |
| Scripts | tsx | 4.21.0 |

Hosting is on Vercel (cron jobs in `vercel.json`).

---

## Local Development Setup

The only database the project has is the production one. **A local `.env.local` that points at the real Supabase project talks to production data.** For experiments, create a separate Supabase project.

### Prerequisites

- Node.js 20 or newer (`@types/node` targets 20; `package.json` does not pin an engine)
- A Supabase project

### Steps

1. **Install**
   ```bash
   git clone <repo-url>
   cd cata-cafe
   npm install
   ```
2. **Create `.env.local`** at the project root with the variables in [Environment Variables](#environment-variables). There is no `.env.example` file in the repository.
3. **Apply the migrations and generate the client**
   ```bash
   npx prisma migrate deploy   # applies the committed migrations
   npx prisma generate
   ```
   (`npx prisma migrate dev` is for creating new migrations while developing a schema change.) On a brand-new empty database the migrations stop at one migration; see `docs/LAUNCH-RUNBOOK.md` §29 for the workaround.
4. **Apply the SQL file by hand**: see [Database and Supabase Setup](#database-and-supabase-setup).
5. **Configure Supabase Auth** (same section), including enabling anonymous sign-ins.
6. **Run**
   ```bash
   npm run dev
   ```
   The app runs at [http://localhost:3000](http://localhost:3000); the default locale is Spanish (`/es`, English at `/en`).

---

## Environment Variables

Create `.env.local`. The boot check in `instrumentation.ts` (`lib/env.ts`) makes a **production** server refuse to start (every request returns 500) if a required variable is missing or blank; it does not fail the build, so the deployment still goes Ready and a preview deployment of the change is the test (preview also runs with `NODE_ENV=production`). In development it only warns.

### Required in production

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (same page) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Server only; never expose it to the browser |
| `DATABASE_URL` | Postgres connection through the Supabase pooler (transaction mode) |
| `NEXT_PUBLIC_SITE_URL` | Your public origin, no trailing slash. Used in emails, sign-in return addresses, the printed join QR and canonical URLs. An `http://` value for a non-local host is upgraded to `https://` |
| `GUEST_CLAIM_SECRET` | Random secret (32+ bytes) that signs the "keep my guest results" links |
| `CRON_SECRET` | Random secret (32+ bytes); Vercel Cron sends it as `Authorization: Bearer` to `/api/cron/*`, which answer 503 without it |
| `RESEND_API_KEY` | Resend API key for outbound email |
| `ANALYTICS_SUPER_ADMIN_EMAIL` | The insights super-admin address: exactly one valid address (a missing, blank or invalid value, such as a list or a typo, refuses to start in production). If unset, nobody is super-admin (no address is built into the code). In local development, set it in `.env.local` if you need to reach the super-admin screens |

### Recommended in production (boot logs a warning if unset)

| Variable | What it is |
|---|---|
| `UNSUBSCRIBE_SECRET` | Signs the group-email unsubscribe links. Optional: when unset the legacy signing secret is used. Once set, never change it, or old links stop working |

### Optional

| Variable | What it does |
|---|---|
| `DIRECT_URL` | Direct (non-pooler) Postgres connection, used only by `prisma migrate`; it falls back to `DATABASE_URL` |
| `EMAIL_FROM` | Sender address override; must be on a domain verified in Resend |
| `ACCOUNT_DELETION_ENABLED` | `1` shows and enables "Eliminar cuenta". Off by default |
| `ANALYTICS_AI_ADMIN_EMAILS` | Comma-separated AI-admin addresses; unset means super-admin only |
| `GEMINI_API_KEY` | Enables the AI narratives and chat; unset shows "AI not configured" |
| `GEMINI_MODEL_LITE`, `GEMINI_MODEL_STANDARD`, `GEMINI_MODEL_PRO` | Model overrides for the AI features |
| `CLOSE_EMAIL_ATTACH_CVA` | `1` also attaches each participant's CVA form PDF to close emails (default: results link and summary PDF only) |
| `DB_POOL_MAX` | Per-instance Postgres pool size; default 8 |

`VERCEL_URL`, `VERCEL_ENV` and `VERCEL_BRANCH_URL` are read from the Vercel platform when present. Step-by-step setup, including where to find each value, is in `docs/LAUNCH-RUNBOOK.md` §3.

---

## Database and Supabase Setup

### Migrations (Prisma)

The schema is `prisma/schema.prisma`; migrations are in `prisma/migrations/` (40 of them). Apply with `npx prisma migrate deploy`; after any schema change run `npx prisma generate`. Prisma connects as the `postgres` role, which bypasses Row Level Security, so authorization is enforced in application code (`lib/sessionAuth.ts` and friends), not by RLS. The generated client lives in `app/generated/prisma/` and is imported from there, not from `@prisma/client`.

### Manual SQL: `prisma/sql/rls_and_triggers.sql`

Prisma does not manage policies, triggers or functions. The file `prisma/sql/rls_and_triggers.sql` holds them and is applied **by hand in the Supabase SQL editor, one phase at a time**, with the matching runbook section (and, for the recent phases, a dry-run script in `prisma/sql/dry-runs/`). Phases in the file:

| Phase | What it does |
|---|---|
| Initial block | Turns on RLS for the original tables and creates `handle_new_user()` (creates a profile on sign-up) |
| 2 | Group sessions, participants, and the community-score trigger |
| 3 | Stores per-attribute community averages in the trigger |
| 4 | Excludes cuppers the organizer removed from the aggregate |
| 5 | Excludes incomplete evaluations from the aggregate |
| 5 (2026-07, second block with the same number) | Locks the saved-insights table behind RLS with no policies |
| 6 | Rounds the community score to 0.25 |
| 7 | Adds `evaluations` and `cupping_sessions` to the Realtime publication |
| 8, 9, 12 | Deny-all RLS on the reference-data, AI-narrative and AI-usage tables |
| 10, 10b | Tasting-group tables; auto-links emailed group invitees when they sign up |
| 11 | Fixes the coffees read policy |
| 13 | Notes the `evaluations.sessionId` column used for Realtime filtering (no SQL to run) |
| 14 | Makes `handle_new_user()` safe for anonymous users (no email) |
| 15 | Comment only (groups v2) |
| 16 | Coffee visibility and sharing policies |
| 17 | Group posts table |
| 18, 18b | Closes anon-key reads and locks down helper functions; 18b restores execute rights that policies need |
| 20 | Hides anonymized (deleted) coffees from direct reads |
| 21 | Closed or expired sessions are read-only in SQL too; participants cannot read others' submitted rows through the API |
| 22 | Outbound-email ledger tables (server only) |
| 23 | Community score deducts nothing below five cups (superseded by 26). Step 1 (the function) is applied; step 2 (recomputing past scores) was **cancelled** and must not be run |
| 24 | API roles are read-only across the whole `public` schema |
| 25 | Hides exclusion metadata of other participants from the API |
| 26 | Community score: flat CVA deduction at any cup count, shared across the pooled cups of the included evaluations (`evaluations.cups`), diluted beyond five. Owner applies it after the `evaluation_cups` migration and a dry run (runbook §30); recomputes nothing |

There is no phase numbered 19 in the file. The runbook (`docs/LAUNCH-RUNBOOK.md`) has a section per phase and per migration, including **§29, building a new environment from an empty database**: two things fail on an empty database (one migration and one statement of the SQL file), and §29 gives the workaround. Which phases are applied in production, and what is still owed, is tracked in `docs/handover/S8-ROLLOUT-HANDOVER.md`.

### Supabase Auth settings

In the Supabase dashboard:

1. **Authentication → Providers**: enable Email (links and codes) and Google. Enable **Allow anonymous sign-ins**, which the guest QR join needs. Apply the phase 14 `handle_new_user()` before enabling it.
2. **Authentication → URL Configuration**: set the Site URL to your origin (https, no trailing slash) and add `<origin>/auth/callback` to the redirect list.
3. **Email templates**: the sign-in emails must contain both the link and the 6-digit code. The templates live in `docs/auth/email-templates/` and are pasted by hand (runbook §15).
4. **Rate limits**: raise the anonymous sign-in and token-verification limits before a large group event (runbook §16).

### Realtime

Realtime updates (live submission counts, waiting-room start, reference changes) rely on phase 7 and on `REPLICA IDENTITY FULL` on `evaluations`, both in the SQL file.

---

## Tests

```bash
npm test          # Vitest over tests/**: pure unit tests, no database, no network
npm run test:db   # 54 tests against a throwaway local Postgres
```

`npm run test:db` starts its own temporary PostgreSQL (the `embedded-postgres` package, installed from `tests/db/package.json` on first run), builds a database from the migrations and the SQL file, runs the tests that move data (scoring trigger, close, deletion, guest merge, email ledgers, RLS), and deletes everything afterwards. A guard refuses any host other than `127.0.0.1`/`localhost` and any database whose name does not start with `cata_test_`, so it cannot touch production. It takes about two minutes. It does not cover Supabase's own services (Auth, the REST layer, Realtime). Details are in `tests/db/README.md`.

`npm run typecheck:db` type-checks that suite.

---

## Project Structure

```
cata-cafe/
├── app/
│   ├── [locale]/                        # every page is under /es or /en
│   │   ├── page.tsx                     # public landing page + waitlist
│   │   ├── privacidad/, terminos/       # draft legal pages (unlinked)
│   │   ├── auth/                        # login, confirm (button completes sign-in), claim (guest results)
│   │   ├── join/[token]/                # session invite page; join/coffee/[token] for coffee invites
│   │   └── app/                         # signed-in area (guests see a subset)
│   │       ├── page.tsx                 # dashboard
│   │       ├── sessions/                # list; new/; express/ ("Catar ahora"); [id]/{cup,waiting,results,print,edit,invite}
│   │       ├── coffees/                 # list; new/; [id]/ and [id]/edit/
│   │       ├── groups/                  # tasting groups; [id]/
│   │       ├── warmup/                  # sensory warm-up library and per-exercise player
│   │       ├── insights/                # restricted analytics: explorer, benchmark, chat, users, access
│   │       ├── profile/                 # profile; history/
│   │       └── team/                    # redirects to groups
│   ├── actions/                         # server actions: every write lives here
│   │   ├── auth.ts, join.ts, guestClaim.ts, account.ts, profile.ts
│   │   ├── sessions.ts, community.ts, offline.ts
│   │   ├── coffees.ts, groups.ts
│   │   ├── analytics.ts, ai.ts, aiChat.ts, waitlist.ts, dev.ts
│   ├── api/
│   │   ├── cron/                        # close-expired-sessions, insights-digest
│   │   ├── sessions/[id]/               # cva-pdf, participant-summary, ficha-tecnica, results-csv
│   │   ├── coffees/[id]/ficha/          # coffee sheet PDF
│   │   ├── groups/unsubscribe/          # public one-click unsubscribe
│   │   ├── insights/report/, health/, dev/
│   ├── auth/callback/route.ts           # sign-in return route (redirects links to the confirm page)
│   ├── generated/prisma/                # generated Prisma client (do not edit)
│   └── layout.tsx, manifest.ts, robots.ts, sitemap.ts, global-error.tsx
├── components/
│   ├── cupping/                         # evaluation forms, flavor picker, phase stepper
│   ├── results/                         # score tables, charts, descriptor views, drill-down dialogs
│   ├── ui/                              # shared UI kit: tables, buttons, dialogs, pills, toasts
│   ├── layout/, dashboard/, session/, session-moments/
│   ├── coffees/, groups/, insights/, profile/
│   ├── auth/, guest/, join/, onboarding/, legal/
│   ├── landing/                         # marketing page, including the particle-canvas journey
│   ├── warmup/                          # warm-up player, figures, breathing canvas
│   ├── offline/, pwa/, errors/, dev/
├── hooks/                               # connectivity, offline sync, resume, warm-up clock and audio, guest claim
├── lib/
│   ├── scoring.ts                       # CVA formulas (the only place that implements them)
│   ├── evaluation.ts, completeness.ts   # derived scores shared by live and offline paths
│   ├── closeSession.ts, closeRules.ts   # the one close routine and its pure rules
│   ├── sessionAuth.ts                   # who may touch a session or sample
│   ├── referenceRules.ts                # reference-sample rules
│   ├── constants.ts                     # flavor wheel, attributes, defect lists
│   ├── offline/                         # IndexedDB draft store and sync status rules
│   ├── reports/, pdf/                   # report data models and PDF documents
│   ├── warmup/                          # exercise content and timeline
│   ├── accountDeletion/                 # account deletion and guest-merge support
│   ├── platform/                        # the one place for browser/native-shell differences
│   ├── analytics/, ai/                  # insights scope, access, Gemini
│   ├── coffees/, landing/, legal/
│   ├── supabase/                        # browser, server, admin (service role) and ephemeral clients
│   ├── prisma.ts                        # Prisma singleton
│   └── env.ts, features.ts, validate.ts, safeAction.ts, log.ts, ...
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── sql/                             # rls_and_triggers.sql (applied by hand) + dry-runs/
├── i18n/, messages/{es,en}.json         # locale routing; all UI text
├── stores/                              # Zustand store for the insights chat
├── public/                              # service worker (sw.js), icons, fonts, landing images
├── scripts/                             # seed, import and preview scripts; scripts/data/
├── tests/                               # Vitest unit tests; tests/db/ for the database suite
├── docs/                                # flows, runbook, handover, product decisions, prompts, audits
├── proxy.ts                             # request gate: session refresh, guest scope, i18n (Next.js 16 name)
├── instrumentation.ts                   # boot env check and error logging
└── vercel.json                          # cron schedule
```

---

## Dev Commands

```bash
npm run dev          # dev server on http://localhost:3000
npm run build        # prisma generate, then production build
npm run start        # serve the production build
npm run lint         # ESLint

npm test             # unit tests
npm run test:db      # database tests against a throwaway local Postgres
npm run typecheck:db # type-check the database tests

npm run seed:test             # seed test users (scripts/seed-test-users.ts)
npm run verify:group-average  # check group-average scoring (scripts/verify-group-average.ts)
npm run import:reference      # import reference series for Insights
npm run import:benchmarks     # import the benchmark cupping dataset for Insights
npm run export:descriptors    # export descriptor data

npx prisma migrate deploy     # apply committed migrations
npx prisma migrate dev        # create/apply a migration while developing a schema change
npx prisma generate           # regenerate the client after a schema change
npx prisma studio             # database browser
```

The seed and import scripts write to whatever database `.env.local` points at.

---

## Further Documentation

| File | What it is |
|---|---|
| `PRODUCT.md` | Product rules and principles |
| `DESIGN.md` | Design tokens and the UI system |
| `CLAUDE.md` | Working guide for coding agents: conventions, patterns, pitfalls |
| `docs/flows.md` | Diagrams of the session lifecycle, sign-in, coffees, groups, results and offline flows |
| `docs/LAUNCH-RUNBOOK.md` | Step-by-step operations: environment, migrations, SQL phases, smoke test, account-deletion rehearsal, empty-database build |
| `docs/handover/S8-ROLLOUT-HANDOVER.md` | What shipped, what is applied in production, what is still owed |
| `docs/HANDOVER.md` | Status ledger for work in progress |
| `docs/product/cata-descentralizada-puntaje.md` | The decided, not-yet-built scoring change |
| `docs/prompts/` | Specifications for upcoming work |
