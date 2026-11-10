# S8-03 — architect decisions and lead-owned code (2026-11-10)

Read after the spec (`../S8-03-guest-guard-email-abuse.md`) and the planner's reconciliation
(`S8-03-tasks.md`). Where this file differs from either, this file wins. Task ids T1–T23 and lead items
L1–L5 are the planner's.

## Lead-owned code: install first, do not redesign

1. `git apply docs/prompts/S8-flows/handoff/S8-03-lead.patch` — L1 (`isRegisteredUser` in
   `lib/guestScope.ts`, `requireRegisteredUser` in `lib/auth.ts`), L5 (`rate_limited` in
   `lib/actionResult.ts`), L3 schema (`OutboundEmailEvent`, `GroupEmailDelivery`, `TastingGroup.clientKey`).
2. Copy the four files in `S8-03-lead/` to their real paths (drop the `.txt`):
   `lib/emailLimits.ts`, `lib/emailKeys.ts`, `lib/emailBudget.ts`,
   `prisma/migrations/20261110120000_outbound_email_ledger/migration.sql`.
3. `npx prisma generate` (never `migrate`; `.env.local` is production and absent here).

`lib/emailLimits.ts` contains ONE `TODO(human)`: the body of `decideThrottle`. **Do not implement it.**
Ricardo writes it. Until he does, skip T10 (`tests/emailLimits.test.ts` for `decideThrottle`); a test
that only pins the constants and `groupRecipientRule` is fine. Everything else compiles around it.
When all other work is done, end your turn by asking Ricardo for it in this format:

> **Learn by Doing**
> **Context:** what is built around the function and why the decision matters.
> **Your Task:** in `lib/emailLimits.ts`, implement `decideThrottle(events, rule, request, now)`. Look for `TODO(human)`.
> **Guidance:** the contract in the doc comment; trade-offs (sliding window vs fixed bucket, how `retryAfterMs` is found for the recipients bound, what an oversize request should return).

After he writes it, add T10's `decideThrottle` cases and re-run the gate.

## Decisions

1. **Limits** (in `lib/emailLimits.ts`): magic link 3 per address and **60 per IP** per 15 min (the spec's
   6 per IP would lock out a cupping room behind one NAT address; the IP rule is an abuse tripwire);
   group mail 3 broadcasts per hour, 300 recipients per day, 40 per day while the account is under 24 h.
2. **Kinds:** `group_broadcast` = `sendGroupEmail`, `notifyGroupOfSession`, the `createGroupPost` blast
   (uses a broadcast slot and recipients). `group_invite` = invitations from `createGroupWithMembers`,
   `addMemberByEmail`, `resendInvitation`, and "retry failed" of a broadcast (recipients only).
   `magic_link` = login form, waitlist, guest claim: ONE reservation per send. The waitlist calls
   `signInWithMagicLink`, so extract one internal, non-exported helper used by both (planner §3.5).
3. **`rate_limited` must reach the UI as a typed result,** never a thrown digest (planner §3.6). When the
   database write already succeeded (`createGroupWithMembers`, `createGroupPost`, `createGroupSession`),
   the action still returns ok with `emailBlocked: "rate_limited"`; the UI shows the notice inline.
4. **Senders the spec missed:** `addMemberByEmail` and the internal `sendGroupInvitationEmails` go through
   the one group sender and the budget (planner §3.1).
5. **`lib/email.ts`:** additive `idempotencyKey`, `status`, `retryAfterMs`, `code` (planner T13). No
   behaviour change for `closeEmail.ts` or `insightsDigestEmail.ts`.
6. **Retry failed:** the client keeps a `broadcastId` (uuid) and resends subject and message with it; the
   server sends only to members of THIS group whose ledger row for that id is not `sent`. Validate the id
   as a uuid; scope by `member.group.createdBy === user.id`. A retry reserves as `group_invite`.
7. **`maskEmail`** moves to a pure `lib/maskEmail.ts` (not `lib/coCuppers.ts`, which imports prisma).
8. **Magic-link origin** (planner §3.3): new pure `lib/trustedOrigin.ts`,
   `pickTrustedOrigin({ requestOrigin, siteOrigin, nodeEnv, vercelEnv, vercelUrls })`: return
   `requestOrigin` only when it equals `siteOrigin`, or `nodeEnv !== "production"` and its host is
   `localhost` / `127.0.0.1`, or `vercelEnv === "preview"` and its host is one of `vercelUrls`
   (`VERCEL_URL`, `VERCEL_BRANCH_URL`); otherwise `siteOrigin`. Unit-test it. Also require
   `next.startsWith("/") && !next.startsWith("//")`, else the default destination. Leave
   `signInWithGoogle` alone (S8-06).
9. **Request IP:** `lib/requestIp.ts` with a pure, tested parser (first `x-forwarded-for` entry, trimmed);
   `null` when absent. `reserveEmailBudget` then skips the IP rule.
10. **`clientKey` replay:** return the stored group only when `createdBy === user.id`; another user's key
    is `invalid_input`; a P2002 on `clientKey` is a replay (planner §3.9).
11. **Certifications:** reject unknown values on create; drop them silently on update (planner §3.10).
12. **Classifications:** `joinCoffeeViaToken` is registered-only and the coffee join page treats an
    anonymous user like a signed-out one (login CTA). `leaveGroup` gets the guard. `updateProfile`,
    `completeOnboarding`, `resendCloseEmails`, `getDeleteImpact`, `deleteSession` are unchanged.
13. **Logging:** no address, name or provider response body in any log line; `lib/log.ts` only, with ids
    and codes.
14. **SQL and runbook numbers:** S8-01 merges first and takes PHASE 21 and runbook §10; write PHASE 22 and
    §11. The block enables RLS on `outbound_email_events` and `group_email_deliveries` with no policies
    (server-only via Prisma), worded like PHASE 12 (`ai_chat_usage`).
15. **Parallel specs merge before this one.** S8-01 edits `upsertEvaluation`, `removeSessionSample`
    (`sessions.ts`) and `submitAllEvaluations`, `joinViaToken`, `revealSample`, and deletes
    `submitSampleEvaluation` / `submitEvaluation` (`community.ts`); S8-02 edits `duplicateCoffee`
    (`coffees.ts`). Do not touch those functions beyond a one-line guard swap. In
    `tests/registeredOnlyActions.test.ts` do not list the two deleted exports as required.
16. **UI:** MD3 tokens, the shared kit in `components/ui/`, inline messages (not only a toast) for
    rate-limit refusals, es and en keys in the same commit.
