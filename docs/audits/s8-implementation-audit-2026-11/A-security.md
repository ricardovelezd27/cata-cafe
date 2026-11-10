# Audit A-security — Security, authorization and SQL (S8 series)

Audited commit: `origin/claude/s8-21-loose-ends-impl` @ `3713033` (detached), baseline `origin/main` @ `6c4ecf5`.
Diff: 420 files, +27 081 / −3 100. Auditor worked read-only; one temporary test file was created, run and deleted (`git status --short` clean at the end).

---

## 1. System overview of the area

**Trust model as designed (CLAUDE.md, S8-01/03 architect files).**

- Every write is a `"use server"` action running through Prisma as `postgres`, which bypasses RLS. So authorization lives entirely in TypeScript: `requireUser` / `requireRegisteredUser` (`lib/auth.ts`) for authentication and guest exclusion, then `requireSession{Owner,Member}` / `requireSample{Owner,Member}` (`lib/sessionAuth.ts`), `usableCoffeeWhere` (`lib/coffeeAccess.ts`) and `getAnalyticsAccess` (`lib/analytics/access.ts`). `assertSessionWritable` (now aware of expiry) and `assertSessionStarted` gate the session lifecycle.
- RLS and grants are defence in depth against the public anon key and any `authenticated` JWT (guests included) that talks to PostgREST or Realtime directly. PHASE 21 (already applied in production) removes the write policies and the INSERT/UPDATE/DELETE/TRUNCATE grants on 9 session tables. It also narrows evaluation and aggregate reads, and hides `session_samples."coffeeId"` through column privileges.
- New public surfaces:
  - `/auth/confirm`: a POST consumes `token_hash`.
  - `verifyEmailCode`: 6-digit OTP.
  - `checkJoinable`: unauthenticated join verdict.
  - `/api/groups/unsubscribe`: HMAC token, which can only switch mail off.
  - The cron routes: bearer `CRON_SECRET`.
- Email abuse limits: a pure rule in `lib/emailLimits.ts` and a check-then-insert ledger in `lib/emailBudget.ts` on `outbound_email_events`. The limits are 3 magic links per address and 60 per IP per 15 min; 3 broadcasts per hour; 300 recipients per day (40 while the account is under 24 h). All group mail goes through `lib/groupEmail.ts`.
- Account deletion (`app/actions/account.ts` → `lib/accountDeletion/*`): this is self-service. It is open to guests and refused for the super-admin. It works in two steps:
  1. A pure plan; kept live sessions are closed first.
  2. One transaction moves the person's kept rows to a per-deletion placeholder (`deleted_<random>`), deletes their solo or unjoined sessions, anonymizes their coffees and deletes the profile last. The auth user is deleted after the commit.
- Redirect hygiene: `lib/safeNext.ts` (the single `next` validator); `lib/trustedOrigin.ts` and `lib/requestOrigin.ts` (the email-link origin never comes from a forged Origin/Host header).

## 2. Architecture assessment

| # | Concern | Class | Assessment |
|---|---|---|---|
| 1 | TS gates are the real authz; RLS is defence in depth | sound | Consistent with how the app works. I mapped every exported action to a guard (§5). All session and sample mutations go through `lib/sessionAuth.ts`, and client-supplied ids are re-resolved, for example `sendGroupEmail` re-checks session ownership. |
| 2 | PHASE 21 closes PostgREST writes only on 9 tables | **A** (design gap) | Several other tables keep `FOR ALL` policies for `authenticated`: `tasting_groups`, `tasting_group_members`, `group_posts`, `coffees`, `user_coffee_history`. One of them can be exploited (A-02). The "belt and braces" reasoning applies to them just as well. |
| 3 | GoTrue (Supabase Auth) calls made server-side from Vercel | **D** (unverified assumption) | Magic-link send and OTP/token verification run from the Next.js server. GoTrue therefore sees Vercel egress IPs, so its per-IP limits are shared by every user of the app. The new code-entry endpoint has no app-level throttle (A-03). |
| 4 | Account deletion shipped live | **C** (mismatch with the architect) + **D** | The architect's S8-04-15 decision says *"`deleteAccount` (T10) is NOT built: it is destructive, needs a tombstone design and owner choices (E3/E4)"*. It was built anyway in S8-19 on assumed defaults; Kim's E3 answer cell is empty. It has never run against any database, and the only database is production (A-01). |
| 5 | Per-group unsubscribe | **C** (minor) | The same architect file says per-group unsubscribe is NOT built (owner decision); S8-20 built it. The implementation itself is sound: HMAC, a neutral 400, GET confirms and POST acts. It is recorded here only for traceability. |
| 6 | Email budget (check-then-insert, no lock) | sound for an abuse limit | The overshoot of one under concurrency is documented and acceptable. Raising the per-IP limit to 60 for NAT rooms is a reasonable trade-off. |
| 7 | One HMAC secret for claim tokens, ledger keys and non-expiring unsubscribe tokens | **A** (minor) | The purposes are domain-separated, so there is no cross-use (verified). However, rotating the secret breaks every unsubscribe link already mailed (A-11). |

## 3. Findings register

Severity scale: Critical = realistic severe exposure or irreversible loss; High = significant defect in an important workflow; Medium = meaningful concern; Low = minor.

### A-01 — High — Release risk: irreversible account deletion ships enabled, never executed, against the architect's hold and without the owner's E3/E4 answers
- **Files:** `components/profile/DeleteAccountDialog.tsx`, `app/[locale]/app/profile/page.tsx:470`, `app/actions/account.ts:41-67`, `lib/accountDeletion/deleteAccount.ts:56-205`, `docs/LAUNCH-RUNBOOK.md` §24.
- **Expected:**
  - The architect's S8-04-15 handoff, §S8-07 item 1: *"`deleteAccount` (T10) is NOT built … needs … owner choices (E3/E4)"*.
  - If it is built anyway, it is verified on a non-production database before users can reach it.
- **Actual:**
  - S8-19 built it on assumed defaults ("E3 default (a), E4 (a)"); `docs/product/kim-flows-2026-11/02-respuestas-kim-plantilla.md:75` has an empty E3 row.
  - The dialog renders for every user with no flag.
  - The code header says *"NEVER RUN against production by a session: it has only been exercised on a throwaway account in a non-production environment"*, but no such environment exists. Memory and runbook both state that `.env.local` IS production, and runbook §24 says *"if no such environment exists yet, wait"*. Merging therefore makes the first real execution a production user's own deletion.
- **What I verified in code** (Verified by reading, plus pure-rule tests I ran):
  - Every write is scoped to the caller's id: `where: { userId }`, `{ cupperId: userId }`, `{ createdBy: userId }`, and kept sessions are limited to planned ids.
  - By-email deletes use exact matching in JS (`exactEmailMatches`; my test confirms `john_doe@` does not match `johnXdoe@`).
  - `profile.delete` runs last and is not caught, so a forgotten Restrict FK rolls the whole deletion back.
  - The super-admin is refused.
  - I found no path that deletes another person's rows.
  - What remains unproven is runtime behaviour: the 120 s transaction, Restrict FKs behaving as the manifest test asserts, and the auth-user delete.
- **Status:** Strongly supported (process/release defect; code reviewed, not executed against Postgres).
- **Smallest safe remediation:** put the "Eliminar cuenta" entry point and `deleteAccount` behind an env flag that defaults to off (for example `ACCOUNT_DELETION_ENABLED=1`). Run runbook §24 on a Supabase branch or staging project (spec S2), get Ricardo/Kim to sign off on E3/E4, then turn it on.
- **Regression test:** an integration test against a disposable Postgres (Prisma migrate on a container) covering the §24 scenario: owner with solo + joined group + live group + coffee + group with a member. Assert that the other users' rows, aggregates and exclusion flags are unchanged, and that the profile row is gone.

### A-02 — Medium — PostgREST write surface left open after PHASE 21. Exploitable: link any user UUID into your group, then mail them from the platform
- **Files:** `prisma/sql/rls_and_triggers.sql:901-920` (`tasting_groups_owner_all`, `tasting_group_members_owner_all`, FOR ALL), `:1133` (`group_posts_write`), `:1251` (`coffees_write`, FOR ALL), `:165` (`history_own`, FOR ALL), `:1238` (`coffees_select` has no `TO` clause, so it also applies to `anon`); `app/actions/groups.ts:820-836` (`liveEmails`), `:740-779` (`sendGroupEmail` job build).
- **Expected:** PHASE 21's stated rule *"no API role can write these tables whatever a future policy says … every write is a server action"*. Also the Phase 18 co-cupper gate: a user id may only be resolved to an email if it belongs to a co-cupper (`coCupperIdsAmong`).
- **Actual:** with any `authenticated` JWT (a guest's included), a group owner can `POST /rest/v1/tasting_group_members` with `{groupId: <own group>, email: "x@x", userId: <victim uuid>}`. The policy USING clause, which doubles as WITH CHECK, only checks group ownership. Victim UUIDs are harvestable:
  - `coffees_select` lets anyone, including `anon`, read public coffees together with their `createdBy`.
  - `participants_select` lists the user ids in sessions you share.

  `sendGroupEmail` / `notifyGroupOfSession` then call `liveEmails`, which runs `admin.auth.admin.getUserById(m.userId)` and sends to the victim's real address with attacker-written subject and message. The volume is bounded by the 300-recipient daily budget.

  The victim also sees the group and the attacker's posts in their own groups list. Code quoted:
  ```ts
  if (!m.userId) return;
  const { data, error } = await admin.auth.admin.getUserById(m.userId);
  const liveEmail = data?.user?.email;
  if (!error && liveEmail) out.set(m.id, liveEmail);
  ```
  Guests can also INSERT `coffees` and `tasting_groups` rows directly, which bypasses `requireRegisteredUser` and coffee-code stamping. They can also forge their own `user_coffee_history` rows (self-only effect, plus an inflated cupper count in another owner's `getCoffeeDeleteImpact`).
- **Status:** Strongly supported (policy text plus code path). Not executed: no database access.
- **Repro (staging only):**
  1. With an authenticated JWT, run `POST /rest/v1/tasting_group_members` with the payload above.
  2. In the app, use "Enviar correo" on that group.
  3. The victim's inbox receives the mail.
- **Smallest remediation:** a PHASE 24 that does two things:
  - Drops the FOR ALL policies on `tasting_groups`, `tasting_group_members`, `group_posts`, `coffees` and `user_coffee_history`, and runs `REVOKE INSERT, UPDATE, DELETE, TRUNCATE … FROM anon, authenticated`. Keep SELECT policies where Realtime or anything else needs them; nothing in the browser writes these tables (`git grep '\.from(' app components hooks lib` is empty on both main and HEAD).
  - Recreates `coffees_select` with `TO authenticated`.

  Optionally, in `liveEmails`, only resolve ids whose stored `email` matches the live address or which passed `coCupperIdsAmong`.
- **Regression test:** extend the PHASE dry-run with probes `insert into tasting_group_members … as authenticated` → refused, and `has_table_privilege('anon','public.coffees','SELECT')` combined with the policy roles. Add a unit test that `liveEmails` refuses unlinked or unverified ids.

### A-03 — Medium — Code and link verification has no app-level throttle, and GoTrue per-IP limits are shared by all users (server-side calls)
- **Files:** `app/actions/auth.ts:62-77` (`verifyEmailCode`), `:84-99` (`confirmEmailToken`), `lib/magicLink.ts:56-66` (`signInWithOtp` from the server), `lib/supabase/server.ts` (no client IP forwarded), `lib/emailBudget.ts` (no `verify` kind).
- **Expected:** S8-03/S8-06 throttle every public auth surface. The runbook (§11) assumes the binding limit is the app's 60/IP tripwire.
- **Actual:**
  - `verifyEmailCode(email, code)` is an unauthenticated server action. It forwards straight to `supabase.auth.verifyOtp`, with no count per email or per IP.
  - Because the call originates from Vercel, GoTrue's per-IP buckets ("token verifications", "sign-ups and sign-ins") are keyed on Vercel egress IPs. The result has two parts:
    - (a) Any visitor can loop over junk codes and exhaust the shared verification bucket, so every user's `/auth/confirm` button and code entry fail with `rate_limited` for the window.
    - (b) Brute-force resistance for a 6-digit code rests entirely on that shared bucket and on Vercel's egress IP rotation.
  - Likewise, a room of 50 people requesting links in 5 minutes can hit GoTrue's sign-in per-IP default before the app's limit. Runbook §11 checks only the "auth email limit".
- **Status:** Code facts verified (grep: no throttle, no IP forwarding). The consequence depends on how GoTrue derives the client IP behind Supabase's edge, so it is a **Hypothesis** until tested on a staging project.
- **Smallest remediation:**
  - Add a `code_verify` kind to the ledger: for example 5 failed attempts per address per 15 min, and 30 per IP per 15 min (HMAC keys as today). Check it before calling `verifyOtp`.
  - Add runbook checks for "Token verifications" and "Sign-ups and sign-ins" under Rate Limits, sized for the largest room.
  - Alternatively, perform OTP verification in the browser with the anon key, so GoTrue sees the user's IP.
- **Regression test:** a pure `decideThrottle` case for the new kind, plus a wiring test that `verifyEmailCode` reserves before it calls Supabase (pattern of `tests/groupMailWiring.test.ts`).

### A-04 — Medium (Hypothesis) — `requestEmailChange` sends Supabase mail outside the app's email budget
- **File:** `app/actions/auth.ts:161-195`.
- **Actual:** any registered account can repeatedly make Supabase mail a confirmation to arbitrary addresses (`updateUser({ email })`). The only limits are GoTrue's per-user frequency and the project-wide auth email quota, which is shared with magic links. One account can therefore drain the hourly project quota and block sign-in links for everyone, and it can spam third parties from the platform's sender.
- **Status:** Code verified; quota semantics are a Hypothesis (Supabase configuration not visible).
- **Fix:** reserve a `magic_link`-kind budget keyed on the target address and the user before `updateUser`.
- **Test:** a wiring test like the one for A-03.

### A-05 — Low — `updateSampleMetadata` ignores `closesAt`, so label and metadata edits still pass on an expired but not-yet-closed session
- **File:** `app/actions/sessions.ts:1524-1541`. The select is `session: { select: { createdBy: true, status: true } }`, then `if (!postCloseNaming) assertSessionWritable(sample.session);`.
- **Expected:** S8-01 decision 1 says `assertSessionWritable` is expiry-aware "for every caller that passes a row with `closesAt`". Only coffee naming on a coffee-less sample is sanctioned after close.
- **Actual:** with no `closesAt` in the row, the check is status-only. A label-only rename succeeds between the deadline and the 06:00 UTC cron.
- **Impact:** owner-only cosmetic drift after the deadline.
- **Status:** Verified (code).
- **Fix:** select `closesAt` and keep `isSessionClosed` only for the `postCloseNaming` branch.
- **Test:** a unit test asserting that a label-only edit on an expired session throws `session_closed`.

### A-06 — Low — `deleteAccount` partial failure leaves kept live sessions closed
- **File:** `lib/accountDeletion/deleteAccount.ts:70-94`. `closeSessionInternal` runs before the transaction; the transaction can still throw `conflict` (re-plan differs), time out (120 s), or fail on a forgotten FK.
- **Effect:** other people's live sessions become closed, revealed and history-synced while the account survives. The outcome is the same as a successful deletion would produce, but the person may give up after the error.
- **Status:** Verified (code order).
- **Fix:** tell the user in the error copy that the listed sessions were already closed, or close them inside the retry loop only after a dry re-plan inside a short transaction. Document it in §24.

### A-07 — Low — Deleting a participant of an open group session freezes the "everyone submitted" rule for the others
- **Files:** `lib/accountDeletion/deleteAccount.ts:115-118` moves the participant row to the placeholder; `results/page.tsx:161` and SQL `can_view_group_results` both require distinct submitted cuppers ≥ participant rows.
- **Effect:** the placeholder never submits, so participants of that session only see group results at close or at the deadline.
- **Status:** Strongly supported.
- **Fix:** on deletion, delete participant rows (and drafts) in sessions that are not closed where the person has no submitted evaluation. Alternatively, count deletion placeholders as submitted in both twins.

### A-08 — Low — `/auth/confirm` allows login CSRF
- **Files:** `app/[locale]/auth/confirm/page.tsx`, `ConfirmClient.tsx`.
- **Actual:** an attacker can send a victim a confirm URL carrying the attacker's own `token_hash`. One click on the generic "Entrar" button signs the victim into the attacker's account, and their cupping then lands there. This is less severe than the old GET auto-consume.
- **Fix:** show the target address on the page before the button (`verifyOtp` cannot preview it, but the template could pass a masked `email` in the URL), or bind it to a same-browser marker.

### A-09 — Low — Unbounded `resendCloseEmails`
- **File:** `app/actions/community.ts:529-553`.
- **Actual:** an owner can re-trigger PDF rendering and sending to every failed recipient without any budget, which is a compute and email amplification limited to their own participants.
- **Fix:** add a per-session cooldown or a `group_invite`-kind reservation.

### A-10 — Low — The PostgREST roster read exposes exclusion metadata
- **Files:** `participants_select` (`rls_and_triggers.sql:144`), `exclusion_reason`, `excluded_by`, `excluded_from_results`.
- **Actual:** every participant can read every peer's exclusion state and reason category over the API.
- **Status:** Strongly supported.
- **Fix:** revoke column SELECT on those columns from `authenticated` (the same pattern as `coffeeId`).

### A-11 — Low — One secret for three purposes; unsubscribe tokens never expire
- **Files:** `lib/groupUnsubscribe.ts:15-19`, `lib/emailKeys.ts:9-13`, `lib/guestClaimToken.ts:24-28`.
- **Effect:** rotating `GUEST_CLAIM_SECRET` after a leak breaks every mailed unsubscribe link and resets throttles. Domain separation itself is fine: claim signatures cover base64url payloads that cannot contain `:`, while unsubscribe and ledger inputs contain `:`, so they cannot collide.
- **Fix:** a dedicated `UNSUBSCRIBE_SECRET` with versioned verification (accept the old and new key).

### A-12 — Low/info — SECURITY DEFINER helpers callable over `/rest/v1/rpc`
- **Detail:** `can_view_group_results(text)` and `is_session_owner(text)` must keep EXECUTE for `authenticated` (PHASE 18b rule). Any signed-in user can therefore probe whether an arbitrary session id exists, is a group session and has visible results. Ids are cuids, so the practical risk is negligible.
- **Action:** document it in the PHASE 21 header.

### Tripped over (outside the diff, possibly critical — one line)
- **A-13 (Medium, Hypothesis):** `app/api/dev/sign-in/route.ts:5` hard-codes `DEV_PASSWORD = "cata-dev-2024"` for `master@`, `par1@` and `par2@cata.test`. With a single Supabase project, if those users exist in production, anyone holding the public anon key can sign in as them through GoTrue's password grant; the `NODE_ENV` guard only protects the route. Check Auth → Users, then delete or rotate.

## 4. Traceability matrix

| Requirement / decision | Expected | Actual | Evidence | Status |
|---|---|---|---|---|
| Every session/sample mutation authorizes via `lib/sessionAuth.ts` | owner/member helpers before any write | All exports mapped (§5). Group and coffee writes use explicit `createdBy` checks. | awk map of `app/actions/*.ts` | Compliant |
| Closed **or expired** = read-only (S8-01 D1) | `assertSessionWritable` with `closesAt` in the row | Applied in upsertEvaluation, submitAll (conditional `updateMany`), offline replay, start/stop warmup, invite, entries lock, reference, add/rename/remove sample. Missing only in `updateSampleMetadata`. | `sessions.ts:1524-1541` | Partially compliant (A-05) |
| Participant cannot write before a live start (S8-01) | `assertSessionStarted` in 3 write paths | upsertEvaluation:699, submitAll:78, offline returns `"pending"` | code | Compliant |
| Guests cannot create assets or send mail (S8-03) | `requireRegisteredUser` on every such export | Applied; tested by `tests/registeredOnlyActions.test.ts` (passes). The PostgREST path still lets guests insert coffees and groups. | A-02 | Partially compliant |
| PHASE 21: no API-role writes | policies dropped and grants revoked | Done for 9 tables; 5 tables with FOR ALL write policies remain | `rls_and_triggers.sql:165,901,912,1133,1251` | Partially compliant (A-02) |
| PHASE 21: participant never reads a peer's evaluation, and aggregates are hidden until visible | `evals_select_own/owner`, `agg_select` + `can_view_group_results` | As specified. The SQL twin matches `canViewGroupResults` (same three branches, strict `<`). | `:1342-1412`, `lib/sessionState.ts:67-78` | Compliant |
| PHASE 21: `coffeeId` hidden | column privileges | Column list matches the `SessionSample` scalar columns exactly (8 minus `coffeeId`); no migration in the diff adds a column | schema vs `:1468` | Compliant |
| PHASE 21 reversibility | rollback restores prior state | Rollback block recreates the policies verbatim from Phases 1/2/18 and re-grants; leftover column grants are harmless | `:1473-1544` | Compliant |
| PHASE 22 | RLS on new ledger tables | Done; `session_reminder_deliveries` enabled in its migration | migrations | Compliant |
| PHASE 23 | trigger mirrors the `cups >= 5` gate, reversible | `IF v_cups_per_sample >= 5 AND v_total_cups > 0`; verbatim rollback; STEP 2 refires every submitted evaluation platform-wide (Realtime UPDATE burst — scoring auditor) | `:1593-1729` | Compliant (in my area) |
| Blind / owner-only data not serialized (S8-02) | physical owner-only, aggregates hidden, coffee only when revealed | `gateSampleForViewer`, `hasCoffee` gated, print/CVA go through `sheetSampleRecords(…, ownerView)`, coffee aggregate via `filterCoffeeSamples` (closed + revealed + exclusions) | `results/page.tsx:803-851`, `lib/reports/sampleGate.ts` | Compliant |
| Report routes mirror page gates | participant-summary 409 while hidden; ficha-tecnica and CSV owner/admin only | As specified; CSV escapes formulas (`lib/csv.ts`) | route files | Compliant |
| Magic-link origin never from headers (S8-03 D8) | `pickTrustedOrigin` | Implemented and used in magicLink, Google, email change, group mail | tests run | Compliant |
| One `next` validator (S8-06) | `safeNext` everywhere | callback, confirm, magic link, code, Google; 16 hostile inputs rejected in my test | §5 | Compliant |
| Email throttles on every public sender (S8-03) | budget before every send | magic link, waitlist, group broadcast/invite/notify. **Not** OTP verification (A-03), **not** email change (A-04), **not** close-email resend (A-09) | code | Partially compliant |
| Unsubscribe: neutral, switch-off only (S8-20) | HMAC, same 400 for every failure, GET confirm | As specified; shape check before the DB | `app/api/groups/unsubscribe/route.ts` | Compliant (built against the architect's "not built", §2.5) |
| deleteAccount not built until owner E3/E4 (S8-04-15 architect) | absent / TODO only | Fully built and live | §A-01 | **Noncompliant** |
| Never log PII | ids and codes only | New log lines checked: no address, name or token; `closeEmail` logs userId + error message | grep of the added `log*` calls | Compliant |
| Cron auth | 503 unset, 401 bad bearer | As specified | cron route | Compliant |

## 5. What I executed (real output)

| Command | Result |
|---|---|
| `git fetch origin && git checkout --detach origin/claude/s8-21-loose-ends-impl` | HEAD `3713033` |
| `npm ci && npx prisma generate` | exit 0; "Generated Prisma Client (7.7.0)" |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | **114 files, 1088 tests passed**, 0 failed |
| `npm run lint` | exit 1: **4 errors, 7 warnings**. The errors are in `app/[locale]/dev/page.tsx` and `components/ui/IntensitySlider.tsx`, both outside the S8 diff (pre-existing). |
| Temporary `tests/_audit_security.test.ts` (39 cases) | **39/39 passed** (details below); file deleted afterwards |
| `git grep -nE '\.(from\|rpc)\(\s*["'\'']' origin/main -- app components hooks lib` and the same on HEAD | no matches on either: no browser PostgREST usage |
| awk map of every exported action to its first guard | all exports guarded (dev actions are `NODE_ENV`-gated) |
| `git status --short` at the end | empty |

What the temporary tests covered:
- `safeNext`: 16 hostile inputs rejected (`//`, `/\`, `%2F`/`%5C`, foreign or look-alike origins, userinfo, `javascript:`, tab, `@` path, loop targets, malformed escapes). Two behaviours are documented rather than rejected:
  - Uppercase `/ES/auth/callback` is not caught by the case-sensitive loop guard; it is harmless.
  - `/.//x` resolves on the same origin.
- `pickTrustedOrigin`: forged, look-alike and production-localhost origins all fall back to the site origin; preview hosts are honoured only in preview.
- `decideThrottle`:
  - retryAfter values are exact;
  - the window boundary is exclusive;
  - an oversize request is refused;
  - negative or NaN recipients are allowed by the pure rule. The caller (`reserveEmailBudget` returns early when `<= 0`) and server-side counts make this safe.
- `parseClientIp`: an empty first entry gives `null`, which skips the IP rule (relies on Vercel overwriting XFF).
- Unsubscribe tokens: bound to both address and group.
- Account deletion:
  - exact email matching (no wildcard);
  - the confirmation word, including a non-string input;
  - joined vs invited-only sessions;
  - `plansEqual` ignores `closeBeforeDelete` by design.
- Guest-claim token: forgery rejected; `back` stays in the app.
- Session state:
  - the expiry boundary is strict;
  - a string `closesAt` without `Z` would parse as local time (no current caller passes strings);
  - `assertSessionStarted`;
  - `evaluateJoin` with a revoked link.
- `csvCell`: formula injection neutralized. A leading NBSP is not neutralized; Excel does not evaluate it.

## 6. What remains unverified, and what would settle it

1. **Runtime behaviour of `deleteAccount`** (A-01). Run runbook §24 on a Supabase branch or staging DB and capture before/after row counts per table for two other users.
2. **GoTrue per-IP semantics behind Vercel** (A-03, A-04). On staging, send 40 `verifyEmailCode` calls with wrong codes from one client, then check whether a second client's valid code is refused. Also read the Rate Limits page values.
3. **Exploitability of A-02 over PostgREST.** On staging, run the insert probe as `authenticated`, then send a broadcast.
4. **PHASE 21 as applied in production.** Run the read-only queries from the PHASE 21 header and the dry-run's section-1 probes (privileges/policies) against production to confirm the live state matches the file. Also confirm Realtime still delivers to owners (the dashboard check in §10).
5. **Vercel overwrites `x-forwarded-for`.** Assumed (Strongly supported by Vercel documentation); not observed.
6. **Existence of the `*@cata.test` users in production** (A-13).

## 7. Answers for this area

- **Did the implementer correctly implement the architecture?** Mostly, yes. The S8-01/02/03 lead-owned code was installed as written:
  - expiry-aware writability;
  - the start gate;
  - the PHASE 21 statements, matching the architect's block exactly;
  - the trusted origin;
  - `requireRegisteredUser`;
  - the ledger.

  The pure rules are well tested. Two divergences are notable:
  - account deletion (and unsubscribe) were built although the architect said not to (A-01);
  - `updateSampleMetadata` misses the expiry half of D1 (A-05).
- **Was the architecture sound?**
  - The app-side authz model and the PHASE 21 direction are sound.
  - PHASE 21 was scoped to session tables only. It left the group and coffee tables writable over PostgREST, and one of them is a real abuse path (A-02).
  - The auth design moved more GoTrue traffic server-side without accounting for per-IP limits (A-03).
- **Most serious defects or risks:**
  - A-01: an irreversible, never-executed deletion path, live for every user, with production as the only database.
  - A-02: arbitrary-user linking plus mailing via PostgREST.
  - A-03: an unthrottled OTP verification endpoint with shared GoTrue limits.
- **What must be fixed before this can be considered reliable:**
  - Feature-flag account deletion off until it is verified on non-production and the owner answers E3/E4.
  - Ship a PHASE 24 that closes the remaining PostgREST writes and adds `TO authenticated` on `coffees_select`.
  - Throttle `verifyEmailCode` / `confirmEmailToken` (and budget `requestEmailChange`).
  - Check the GoTrue rate-limit settings before the next live event.
  - Fix A-05 (one-line select).
- **Uncertainties:**
  - GoTrue IP attribution.
  - The live production policy state versus the file.
  - Runtime FK behaviour of the deletion transaction.
  - Whether the dev test users exist in production.
