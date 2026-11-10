# S8-03 — Registered-only writes and email abuse

> **When:** after S8-01 and S8-02 (ship this week) · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** `migrate deploy` (one migration), then the next free SQL PHASE (22 if S8-01 landed) enabling RLS on the two new tables (runbook §11); Resend plan limit
> **Findings:** 11 (2 P1 · 7 P2 · 2 P3) from `docs/audits/flows-2026-11/03-invitado-qr-claim.md, 04-empezar-cata.md, 06-crear-sesion.md, 12-cafes.md, 13-grupos.md, 01-entrar.md, 18-landing.md` · **Gated on Kim:** none

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list. Theme: an anonymous QR
guest can call create/share/send server actions directly (proxy.ts only gates pages), and anyone can make us
send unlimited branded email. Add ONE registered-only guard, apply it to every creator/sharer/sender, and put
a ledger-backed throttle in front of every sender. Invariants: guest scope extended to actions, run()/
ActionResult, lib/validate.ts, lib/log.ts (no emails in logs), co-cupper masking, one migration. Out of
scope: OTP (S8-06), unsubscribe (S8-14), invite revocation (S8-11). Lead owns guard, limits and
ledger shape; Sonnet may apply call sites, i18n and tests. One commit per step, `npx tsc --noEmit && npm run
lint && npm test` before each, update docs/flows.md, finish with the Definition of done in the PR
description. Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-guest-1 | P1 | CONFIRMED | Guest can create groups/sessions and send email by direct call (owns the shared guard) | `03-invitado-qr-claim.md` |
| F-grupos-1 | P1 | CONFIRMED | Any account can send unlimited branded email; no volume cap | `13-grupos.md` |
| F-04-1 | P2 | CONFIRMED | `createSession`/`createGroupSession` accept anonymous users | `04-empezar-cata.md` |
| F-crear-sesion-4 | P2 | CONFIRMED | Guard gap plus unbounded coffees and field lengths (input-bounds part kept here) | `06-crear-sesion.md` |
| F-grupos-7 | P2 | PLAUSIBLE | 20-way sends, no retry, no ledger, addresses in logs | `13-grupos.md` |
| F-grupos-3 | P2 | CONFIRMED | Send results return linked members' live addresses | `13-grupos.md` |
| F-grupos-2 | P2 | CONFIRMED | Announcements email the roster by default; outcome hidden | `13-grupos.md` |
| F-entrar-6 | P2 | PLAUSIBLE | Magic link unthrottled; link host from request headers | `01-entrar.md` |
| F-landing-2 | P2 | CONFIRMED | Waitlist has only a honeypot; row stored before send | `18-landing.md` |
| F-cafes-7 | P3 | CONFIRMED | Coffee actions accept guests and unvalidated text (bundled) | `12-cafes.md` |
| F-grupos-5 | P3 | CONFIRMED (lowered) | Second click after the summary duplicates group and blast (bundled) | `13-grupos.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| — | none | — | — |

## 4. Plan

1. **One guard.** Pure `isRegisteredUser(user)` in `lib/guestScope.ts`; `requireRegisteredUser()` in `lib/auth.ts` checks `is_anonymous` before the profile upsert and throws `not_found_or_forbidden`. Tested in `tests/guestScope.test.ts`. Covers: F-guest-1, F-04-1
2. **Apply it.** Swap `requireUser()` for it in `createSession`, `createGroupSession`, `duplicateSession`, `createExpressSession` (replace its inline check) in `app/actions/sessions.ts`; every export of `app/actions/coffees.ts` and `app/actions/groups.ts`; `createInviteToken` in `community.ts`. Guests keep `joinViaToken`, `completeGuestOnboarding`, evaluation/submit, waiting, offline and claim actions. `tests/registeredOnlyActions.test.ts` scans the files and fails if a listed export lacks the call. Covers: F-guest-1, F-04-1, F-crear-sesion-4, F-cafes-7
3. **Bounds.** `validateSessionInput` (`sessions.ts:119-148`): cap coffees at 100, bound coffee fields, notes, certifications (known list) and `s.label` type/length via `lib/validate.ts`. `createCoffee`/`updateCoffee` (`coffees.ts:161-183,232-248`): name ≤120, fields ≤200, notes ≤2000, else `invalid_input`. Covers: F-crear-sesion-4, F-cafes-7
4. **Limits and ledger.** Pure `lib/emailLimits.ts` with named constants and a tested `decideThrottle`: magic link 6 per IP and 3 per address per 15 min; group mail 3 broadcasts/hour, 300 recipients/day, 40/day while `Profile.createdAt` is under 24 h. One migration adds `OutboundEmailEvent` (`kind`, `actorKey`, `targetKey`, `recipients`, `createdAt`; `actorKey` = user id or HMAC of the IP with `GUEST_CLAIM_SECRET`, `targetKey` = HMAC of the lowercased address, never raw), `GroupEmailDelivery` (`broadcastId`, `memberId`, `status` sent|skipped|failed, `attempts`, `lastError` code; `@@id([broadcastId, memberId])`, the close-email ledger's shape) and `TastingGroup.clientKey String? @unique`. No user FK, so `mergeGuestData` is untouched. `reserveEmailBudget()` writes before sending and yields `rate_limited`, a new `ACTION_ERROR_CODES` entry with es/en `errors.codes` copy. Covers: F-grupos-1, F-entrar-6, F-landing-2
5. **Magic link and waitlist.** `signInWithMagicLink` (`app/actions/auth.ts:31`) reads the IP from `x-forwarded-for`, reserves budget, returns `rate_limited` (login form reuses `rateLimitErrorLabel`), and builds the base URL with `siteOrigin()` (`lib/inviteUrl.ts`), not request headers. `reserveFoundingSeat` (`waitlist.ts:19`) checks first, inserts the row only after, keeps the honeypot. Never cookie-keyed. Covers: F-entrar-6, F-landing-2
6. **One group sender.** New `lib/groupEmail.ts` for `sendGroupEmail`, `notifyGroupOfSession`, `createGroupWithMembers`, `createGroupPost`, `resendInvitation`: concurrency 4, backoff on 429/5xx with a Resend `Idempotency-Key` per broadcast and member, a ledger row per recipient, budget first, `lib/log.ts` with ids and codes only (drop the `console.warn` at `groups.ts:316-323,755-762,927-934`). "Reintentar fallidos" in `GroupEmailComposer.tsx` resends non-sent rows only. Covers: F-grupos-1, F-grupos-7
7. **No live addresses to the browser.** Results keyed by `memberId` with a name or masked label. Move the private `maskEmail` (`groups/[id]/page.tsx:32`) to `lib/coCuppers.ts`; use it in `GroupEmailComposer.tsx:165`, the `emailSummary` consumers and the feed fallback (`page.tsx:299`). Covers: F-grupos-3
8. **Opt-in announcements.** `PostComposer.tsx:29` defaults off, shows "se enviará a N personas", then sent/skipped/failed (result ignored today, `:51-57`). Covers: F-grupos-2
9. **Create-group replay.** `CreateGroupDialog.tsx` stays disabled until navigation (`:132-136,265`) and posts a `clientKey`; a replay returns the stored group, no second blast. Covers: F-grupos-5
10. **Docs.** Runbook §11 (deploy, RLS-on/no-policy for both tables, Resend limit), `docs/flows.md`, one CLAUDE.md line.

## 5. Acceptance (tests to write or checks to run)

- F-guest-1, F-04-1, F-crear-sesion-4, F-cafes-7: an anonymous direct POST to each listed action returns `not_found_or_forbidden` and writes nothing; scan test passes; 101 coffees or a 5 000-character label gives a field error.
- F-grupos-1: the 4th broadcast in an hour returns `rate_limited` (es/en); the under-24 h cap applies; a unit test pins the constants.
- F-entrar-6, F-landing-2: 10 rapid sends from one IP pass at most 6; a normal visitor gets the link first try; link host never from headers; waitlist row only after the check.
- F-grupos-7: retry resends failed rows only; no recipient gets one broadcast twice; no email string in logs.
- F-grupos-3: action JSON has no `@` for linked members. F-grupos-2: a new post emails only if ticked. F-grupos-5: two submits within 2 s give one group and one email per recipient.

## 6. Manual steps for Ricardo

- `prisma migrate deploy` from the right checkout before deploying; then the RLS block for the two tables; check the Resend plan and Supabase email limits.

## 7. Risks and rollback

- Tight limits can lock a live-event morning: constants sit in one file. Registered-only could break a hidden guest path: scan test plus a QR-guest smoke run. Rollback: revert; the tables are additive.

## 8. Native-readiness clause

- Throttles are server-side on IP and address, never cookie or CAPTCHA; refusal copy shows inline, not only in a toast.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/guestScope.test.ts`, `tests/registeredOnlyActions.test.ts`, `tests/emailLimits.test.ts`)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-03 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the group dialogs and composers
- [ ] gated items either done or left as named TODOs listed in the PR description
