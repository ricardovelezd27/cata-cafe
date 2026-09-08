# Launch-readiness changes — September 2026 (plain language)

This is the non-technical summary of the review and fixes done between 8 September
and launch (1 October 2026). It says what was wrong, what changed for each kind of
user, what you still have to do by hand, and what was deliberately left for later.
The technical detail lives in `CLAUDE.md`, `docs/flows.md` and the commit messages on
the six `claude/launch-*` branches.

## What was wrong

The app worked, but several things would have broken the first real event:

1. **Two open doors in the database.** Anyone with the app's public browser key could
   read every invite link on the platform (and walk into any group session), and every
   user's profile row.
2. **Two ways to read other people's private coffees**, one way to attach someone
   else's private coffee to your own session, and one way to look up any user's email
   address from their id.
3. **Participants could overwrite the organiser's data** (green-bean assessment and
   reveal information) and could see reveal data before the reveal.
4. **Deleting a session silently deleted every participant's evaluations** and their
   coffee history.
5. **A closed session was still fully editable**, and edits after closing did not update
   the group scores, so the numbers on screen could silently stop matching the data.
6. **Closing a group session could send everyone their PDF twice**, and usually wrote no
   coffee history at all, because samples were never revealed.
7. **Live sessions could get stuck**: the only "start" button was on a screen the
   organiser leaves right away, so participants waited forever. Sessions with a deadline
   never closed by themselves.
8. **Errors showed a raw English "Application error" page**, a login link that had
   expired showed nothing, and many buttons failed silently. Nothing was logged, so you
   could not know production was failing.
9. **The cupping screen said "saved" even when the server had rejected the save**, and
   unsynced work was invisible once you left that screen.
10. Printed QR codes and emails pointed at `localhost` unless a setting was configured.

## What changed, by user

### Organiser (session owner)
- A **"Iniciar cata" button** in the master panel starts a live session at any time.
- **Closing is safe**: a second click does nothing, every coffee-linked sample is
  revealed automatically, coffee history is written, and the results page shows how many
  close emails were **sent / had no email / failed / pending**, with a **"Reenviar"**
  button that only retries the ones that did not go out.
- **Sessions with a deadline close themselves** every morning (06:00 UTC).
- **Deleting a session** now shows which coffees are involved and who owns them, and how
  many cuppers are affected. The session and its evaluations go; each cupper keeps an
  anonymised entry in their coffee history so their taste profile survives.
- Closed sessions are read-only. Opening the cupping screen of a closed session takes you
  to the results.
- Physical (green bean) and reveal data are yours only; participants no longer see those
  tabs.
- Opening your own invite link no longer demotes you to "participant".

### Participant / cupper
- The waiting room has a way back, tells you when the live connection dropped (and keeps
  checking every 15 seconds), and sends you to the results if the session already closed.
- Re-opening an invite link does not use up a seat; seat limits are enforced correctly
  even when many people scan at the same second.
- The save indicator is honest: **green** means it reached the server, **amber** means it
  is stored on this device and will sync when you are back online. A small badge on every
  app screen shows how many drafts are still waiting to sync.
- If your browser cannot store drafts (private mode), the app tells you instead of
  pretending.
- Invalid, expired or used-up invite links explain themselves and offer a way out.

### Guests (QR walk-ups without an account)
- Guests can cup, wait and see results, and nothing else. They can no longer wander into
  the coffees, groups or profile areas and create things under a throwaway identity.
- Guests without an email are reported as "no email" on close, not as a failure.

### Everyone
- Friendly, translated error and "page not found" screens with a **retry** button, a
  link home, and a **support code** you can quote to us.
- An expired login link now says so and lets you request a new one; the Google button
  reports failures instead of doing nothing.
- Every button that talks to the server shows a short message when something goes wrong.
- Signing out on a shared tablet wipes the cached pages so the next person never sees the
  previous person's data.
- Scores can no longer be inflated by a modified browser: cup counts and the format used
  for scoring are taken from the session, never from the device.

## What you still have to do by hand

Everything is in `docs/LAUNCH-RUNBOOK.md`, step by step with what to click and how to
verify:

1. **§1 Supabase SQL** — close the two open doors (5 minutes). Do this first; it is
   independent of any deploy.
2. **§2 Database migration** — `npx prisma migrate deploy` right before deploying the
   session changes. Until this is done I cannot test the session flows against the real
   database.
3. **§3 Vercel settings** — six environment variables and a check that the new daily
   cron appears. The app now refuses to start in production if the important ones are
   missing, so this is not optional.
4. **§4** — how to find an error from a user's support code (for later).
5. **§5** — the post-deploy smoke test (15 minutes with two accounts).

## Deliberately left for after launch

Real, but lower risk, and documented in the plan: narrowing what analytics-access users
can see to their own data; an account-deletion page; a warning with the affected-user
count when deleting a coffee; a Content-Security-Policy header; converting the remaining
server actions to the new result contract; making the monthly digest cron fully
idempotent.

## How to check the work

```bash
npm test          # 33 unit tests (scoring formula, validation, session rules, guest scope)
npm run lint
npm run build
```

All three pass on every `claude/launch-*` branch. The branches stack in this order and
should be merged in this order: `launch-wp3a-boundaries` (security + error screens) →
`launch-wp2-state-machine` → `launch-wp3b-actions` → `launch-wp4-observability` →
`launch-wp5-deploy` → `launch-docs`.
