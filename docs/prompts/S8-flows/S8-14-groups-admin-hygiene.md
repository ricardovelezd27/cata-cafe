# S8-14 — Groups and admin hygiene

> **When:** last in the series; after S8-03 (email throttles/ledger) and S8-11 (group invite path) so `lib/email.ts` and `groups.ts` are stable · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** ONE migration (`migrate deploy`) before the deploy; answer D7 (default needs no extra work)
> **Findings:** 7 (0 P1 · 0 P2 · 7 P3) from `docs/audits/flows-2026-11/13-grupos.md`, `17-insights-admin.md`, `18-landing.md` · **Gated on Kim:** D7

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read 13-grupos.md, 17-insights-admin.md and 18-landing.md in
docs/audits/flows-2026-11/ finding by finding (including §7 verdicts and §4 "Keep"): every change maps to a
finding id. This is polish only: seven small, independent fixes. Each numbered step must be shippable on its
own — one commit, green gate, no step depends on another unless it says so. Do NOT touch the abuse
throttles or email ledger (S8-03) or the live invite path (S8-11); if not on `main` yet, stop and say so.
Sonnet may do steps 3, 6, 7; the lead keeps the migration, the unsubscribe token (2) and the digest claim (5). Work in order,
`npx tsc --noEmit && npm run lint && npm test` before each commit, finish with the Definition of done in
the PR description. No bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-grupos-8 | P3 | not re-verified | Email links from request headers, address in URL, no unsubscribe | `13` |
| F-grupos-9 | P3 | not re-verified | Group actions throw; one generic error; `window.confirm` on remove | `13` |
| F-grupos-10 | P3 | not re-verified | Members see the full roster, barely masked emails | `13` |
| F-insights-3 | P3 | CONFIRMED (code) | Digest checks, sends, then records; Spanish link for English | `17` |
| F-insights-6 | P3 | inferred | Chat quota incremented after the model loop | `17` |
| F-insights-7 | P3 | CONFIRMED | Insight actions throw opaque `forbidden` | `17` |
| F-landing-5 | P3 | CONFIRMED | "100 plazas" is literal; the 101st gets "Plaza reservada" | `18` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| D7 | Who sees a group's member list: (a) everyone's names, (b) only names the teacher chooses, (c) only the teacher? | (a) all members see names | Step 4 only (stricter mask). If (b) or (c): follow-up PR with a roster setting; leave `// TODO(D7)` in `groups/[id]/page.tsx` |

## 4. Plan

1. **One site URL, no address in links** — add `lib/siteUrl.ts` (`NEXT_PUBLIC_SITE_URL`, localhost fallback in dev only, same rule as `lib/insightsDigestEmail.ts:286`). Replace `getOrigin()` in `app/actions/groups.ts:26-32` and `app/actions/auth.ts:7-13`. Remove `?email=` from the invitation URL (`groups.ts:293-295`) and the session-invite URL (`:906-908`); the login page keeps accepting `email` (`auth/login/page.tsx:12-15`) but nothing sends it. Invariant: none. Covers: F-grupos-8 (links half).
2. **Unsubscribe per group** — migration adds `email_opt_out_at timestamptz` to `tasting_group_members`. New `lib/groupUnsubscribe.ts`: HMAC-signed token (same pattern and secret handling as `lib/guestClaim.ts`) over `groupId + email`, no expiry. Public route `app/api/groups/unsubscribe/route.ts`: GET shows a confirm page, POST (RFC 8058 one-click) sets `email_opt_out_at`; `runtime = "nodejs"`, `force-dynamic`, no auth, works outside the app. `lib/email.ts:64-69` accepts optional `headers`; the three group templates (invite, post blast, session notify) add a footer link plus `List-Unsubscribe` and `List-Unsubscribe-Post`. The three send loops skip members with `email_opt_out_at`. Owner re-adding the address does not clear the opt-out. Covers: F-grupos-8.
3. **Group actions return `ActionResult`** — wrap `updateGroup`, `addMemberByEmail`, `addMemberByUserId`, `removeMember`, `updateMemberDisplayName`, `resendInvitation`, `createGroupPost`, `notifyGroupOfSession` in `run()`; `deleteGroup` and `leaveGroup` may keep throwing because `ConfirmDialog` wraps them. Add codes `group_full`, `invalid_email` and `offline` to `ACTION_ERROR_CODES` (`lib/actionResult.ts`) with es/en copy under `errors.codes`, and a thrown `Error("group_full")` at the 200-member check (`groups.ts` ~511). Clients (`MemberList.tsx:49-53`, `AddByEmailForm.tsx:56-58`, `QuickAddCoCuppers.tsx:33-35`) use `useActionFeedback`; a failed fetch shows `offline`. Replace `window.confirm` (`MemberList.tsx:44`) with `ConfirmDialog` that names the person. Invariant: ActionResult contract is restored. Covers: F-grupos-9.
4. **Roster mask (D7 default)** — extract `maskEmail` from `groups/[id]/page.tsx:32-38` into `lib/maskEmail.ts` (it is also used at `:472`); member-visible rows use a strict variant (first letter, "•••", TLD only); the owner roster keeps the current mask. Covers: F-grupos-10.
5. **Digest claim-first** — migration adds `status text default 'done'` and `results jsonb` to `digest_runs`. `sendInsightsDigest` (`lib/insightsDigestEmail.ts:224-299`) first inserts the period as `running` (unique violation = already running or ran → return `alreadyRan`), sends, records per-recipient outcomes in `results`, then sets `done`; a run with zero successful sends deletes its row (month stays retryable); a re-run sends only to recipients without a `sent` result. The insights link uses the recipient locale (`:212`, `/${locale}/app/insights`). Show last run and counts on the Acceso page. Cron contract untouched. Covers: F-insights-3.
6. **Atomic chat slot and insight results** — in `app/actions/aiChat.ts:83-200` reserve the slot before the model loop (`upsert` create 0, then `updateMany where questionCount < limit` increment; zero rows = `limit_reached`); on failure before any successful model call decrement it (keeps "not billed if no call succeeded"). Wrap the interactive actions in `app/actions/analytics.ts` (`runInsight`, `runPivot`, `saveInsight`, `deleteSavedInsight`, `runBenchmark`, `runOriginContext`, list helpers) in `run()`; the guard in `lib/analytics/access.ts:81-106` maps via the existing `forbidden` classifier; callers use `useActionFeedback`. Covers: F-insights-6, F-insights-7.
7. **Founding-seat copy** — add `lib/landing/founding.ts` exporting `FOUNDING_SEATS = 100`; feed `messages` placeholders (`heroCount` at `es.json:1118`, `offer` at `:1120`, `FoundingSection.tsx:54`, `HeroFoundingCard.tsx:38`) from it using `t.raw()` + client replace where the component is a client component (never call `t()` without the arg). Reword the success text to "Te enviamos el enlace; quedas en la lista fundadora" in es/en. `reserveFoundingSeat` still never counts rows and always sends the link; a duplicate email stays idempotent (P2002). Enforcing the cap is Ricardo's call. Covers: F-landing-5.

## 5. Acceptance (tests to write or checks to run)

- F-grupos-8: preview sends link to `NEXT_PUBLIC_SITE_URL`; no URL contains `email=`; unsubscribe stops later sends for that group only; headers on all three templates (`tests/groupUnsubscribe.test.ts`: round trip, tamper).
- F-grupos-9: `group_full` and `invalid_email` each show their own toast; offline shows the `offline` copy; remove names the person; no `window.confirm` left under `components/groups`.
- F-grupos-10: strict mask test (`a•••@•••.com`); owner view unchanged.
- F-insights-3: two simultaneous calls send each recipient at most once; a run with no email key leaves the period retryable; the English email links to `/en/app/insights`.
- F-insights-6: 30 parallel calls produce at most 25 model runs; provider failure before any success restores the slot.
- F-insights-7: a revoked flagged user pressing "Guardar" gets the localized forbidden toast; no error boundary.
- F-landing-5: one constant feeds copy and action; duplicate email takes no second row; link sent in every case.

## 6. Manual steps for Ricardo

- `npx prisma migrate deploy` before the deploy (one migration, steps 2 and 5: one nullable column, two columns with defaults; backwards compatible).
- Confirm `NEXT_PUBLIC_SITE_URL` and `GUEST_CLAIM_SECRET` exist in Vercel preview too.

## 7. Risks and rollback

- Show "se dio de baja" on the owner roster. Dropping `?email=` removes login prefill (accepted; revert step 1). A crashed digest `running` row needs a 30-minute stale takeover.

## 8. Native-readiness clause

- Email links are plain HTTPS URLs a universal link can claim; unsubscribe works with no app or session; dialogs replace `window.confirm`; offline failures show the same copy in the shell.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/groupUnsubscribe.test.ts`, `tests/maskEmail.test.ts`, existing action-error tests)
- [ ] docs/flows.md §3 updated (unsubscribe, roster mask); audit file(s) get a line `Fixed in S8-14 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the member list, remove dialog and the founding card
- [ ] D7 either confirmed as default or left as the named TODO in the PR description
