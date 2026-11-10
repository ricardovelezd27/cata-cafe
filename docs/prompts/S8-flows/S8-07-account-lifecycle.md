# S8-07 — Account lifecycle and guest safety

> **When:** after S8-06 (needs `/auth/confirm` accepting `email_change`) · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** `migrate deploy` (tombstone profile) BEFORE the deploy; Supabase settings (§6)
> **Findings:** 12 (1 P1 · 5 P2 · 6 P3) from `docs/audits/flows-2026-11/02-cuenta.md`, `03-invitado-qr-claim.md` · **Gated on Kim:** E1, E3, E4

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list. Theme: a person can
delete the account, change mailbox, sign out without surprise, and a guest never loses work silently.
Invariants: closed = read-only (deletion is a NEW sanctioned write — add it to docs/flows.md §1), coffees
anonymize, participant-tier anonymity, claim never merges on GET, every user FK goes into mergeGuestData,
ActionResult. `.env.local` IS
production: never run the migration or deleteAccount against it. Out of scope: orphaned drafts (S8-09), legal pages (S8-08). Haiku: i18n, runbook; Sonnet: dialogs, pure token module; the
lead keeps manifest, action, migration, mergeGuestData. Work the plan in order,
one commit per step, `npx tsc --noEmit && npm run lint && npm test` before each commit, update
docs/flows.md in the same PR, and finish with the Definition of done checklist in the PR description.
Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-cuenta-1 | P1 | CONFIRMED | No deletion; seven `Profile` relations restrict (`schema.prisma:53,118,136,212,249,264,366`) | `02-cuenta.md` |
| F-cuenta-5 | P2 | CONFIRMED | No email change | `02-cuenta.md` |
| F-cuenta-6 | P2 | CONFIRMED | Guest/pending drafts leave in one tap (`SignOutButton.tsx:29-35`) | `02-cuenta.md` |
| F-guest-4 | P2 | CONFIRMED | Sign-out, switch, claim "Cancelar", shared phone destroy identity | `03-invitado-qr-claim.md` |
| F-guest-3 | P2 | CONFIRMED | Join: generic error, orphan anon users (`GuestJoinForm.tsx:54-61`) | `03-invitado-qr-claim.md` |
| F-guest-2 | P2 (was P1) | PLAUSIBLE | Anonymous limit unplanned (`GuestJoinForm.tsx:41-47`) | `03-invitado-qr-claim.md` |
| F-cuenta-2 | P3 (was P2) | CONFIRMED | `signOut()` global scope (`auth.ts:56-57`) | `02-cuenta.md` |
| F-cuenta-7 | P3 | needs-runtime | Offline "Salir" wipes caches then fails | `02-cuenta.md` |
| F-guest-9 | P3 | CONFIRMED | 7-day bearer claim token in URL/mail | `03-invitado-qr-claim.md` |
| F-guest-8 | P3 | CONFIRMED | Claim failure opaque; no token tests; two bare userId tables | `03-invitado-qr-claim.md` |
| F-guest-6 | P3 (was P2) | PLAUSIBLE | Merge re-fires whole-session aggregates (`guestClaim.ts:157,310-319`) | `03-invitado-qr-claim.md` |
| F-cuenta-8 | P3 | CONFIRMED | `updateProfile` throws, name unsynced (`profile.ts:75-86`) | `02-cuenta.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| E1 | Own phone or shared tablet; "¿Eres Pepe?"; organizer on two devices? | (c): "Salir" ends only this device and the join page asks "¿Eres X?" | Build the default |
| E3 | Organizer deletes account: do others keep results? | (a) kept, without the organizer's name | Build (a) only |
| E4 | Lost school mailbox: what happens to history? | (a) self-service change + (c) manual by Ricardo | Build (a); (c) in the runbook |

## 4. Plan

1. **Manifest and test** — `lib/accountDeletion/manifest.ts` lists every `Profile` relation and bare `userId` column (`CloseEmailDelivery`, `AiChatUsage`, waitlist by email) with its rule: erase, reassign to tombstone, cascade. `tests/profileRelations.test.ts` parses `schema.prisma` and fails on an unlisted relation; `mergeGuestData` is asserted against it. Covers: F-cuenta-1, F-guest-8.
2. **Migration (one)** — insert tombstone profile "Cuenta eliminada" (fixed id, `ON CONFLICT DO NOTHING`); no column changes; name rendered from i18n. Covers: F-cuenta-1.
3. **`deleteAccount`** — `app/actions/account.ts`, `run()`, guests allowed, typed confirm. One transaction per the manifest (E3 (a)): sessions and groups with other participants, and all coffees (anonymized as today), go to the tombstone; solo sessions and empty groups are deleted; the user's own evaluations are NOT erased: they are reassigned to the tombstone profile (cupperId → tombstone id, display name "Catador eliminado"), so community scores, SD and other cuppers' history do not move — this is the anonymization route the asset-admin brief documents (EDPB: anonymized data falls outside the GDPR), and a true erasure of the rows stays available as a manual super-admin path for an explicit Art. 17 request; physical/extrinsic authorship moves to the tombstone; waitlist row removed; `auth.admin.deleteUser` AFTER commit, idempotent, retryable. Covers: F-cuenta-1.
4. **Delete UI** — danger zone in the Cuenta card (guests too), impact line, `ConfirmDialog`; on success clear device state plus that user's IndexedDB drafts, land on the locale landing. In-app only (Apple 5.1.1(v)). Covers: F-cuenta-1.
5. **Email change** — `requestEmailChange`: registered only, `updateUser({ email }, { emailRedirectTo })` returning through the S8-06 confirm page (`email_change`); card shows the pending address; `email_exists` localized; no second `Profile` row. Covers: F-cuenta-5.
6. **Sign-out** — `signOut(locale, scope)` defaults to `'local'`; "cerrar en todos los dispositivos" in the Cuenta card. `SignOutButton` calls the action first and clears device state only on success; offline shows "Necesitas conexión" via `useActionFeedback`. Guests get a loss warning with "Guardar mis resultados" (`useGuestClaim`) primary; anyone with pending drafts sees the `PendingDraftsBadge` count. Same guard on "Cambiar de cuenta". Covers: F-cuenta-6, F-guest-4, F-cuenta-2, F-cuenta-7.
7. **Shared phone and claim exits** — signed-in anonymous visitor on `/join`: "Entrar como X" / "No soy X" (warning if evaluations exist); claim card trades "Cancelar" for "Usar otra cuenta" and "No vincular" with warning. Covers: F-guest-4.
8. **Guest join** — `run()` `checkJoinable(token)` before `signInAnonymously` (invite, expiry, seats, status); closed state on the page; codes mapped to localized copy; existing anonymous user reused; rate-limit error gets its own message. Covers: F-guest-3, F-guest-2.
9. **Claim hardening** — pure `lib/guestClaimToken.ts` and extracted `anonEvalWins` with vitest (tamper, expiry, replay); `confirmGuestClaim` in `run()` with a retry card, `lookup_failed` apart from `already`; the two bare-userId tables merged; card shows evaluation count; TTL stays 7 days with the risk written in `docs/flows.md`; transaction timeout set and refire limited to conflicted samples. In-place `updateUser`/`linkIdentity` upgrade NOT built (P3 until measured; it bends the claim design): named TODO. Covers: F-guest-8, F-guest-9, F-guest-6.
10. **`updateProfile`** — `run()`, sync `display_name`, tie labels to inputs, live status. Covers: F-cuenta-8.
11. **Runbook** — guest capacity: raise the per-IP anonymous limit to 2x expected guests per hour, verify with 40 sequential joins, fallback (email login). Covers: F-guest-2.

## 5. Acceptance (tests to write or checks to run)

- F-cuenta-1: relation test fails on an unlisted relation; others still see a deleted organizer's closed results; same email can sign up again; a guest sees the control; no row keeps name or email.
- F-cuenta-5: confirmation returns to `/app/profile`; pending address shown.
- F-cuenta-6 / F-guest-4: nothing signs out until chosen; count matches `PendingDraftsBadge`; a second guest can start fresh.
- F-cuenta-2 / 7: device B stays signed in after A signs out; offline tap shows the message, cached pages load.
- F-guest-3 / 2 / 8 / 9: closed link shows its state with no sign-in; five failed retries create no extra anonymous user; forged and expired tokens rejected; forced FK error shows the retry card.

## 6. Manual steps for Ricardo

- `migrate deploy` from the right checkout, then deploy. Never from a session.
- Supabase: "Secure email change"; anonymous sign-in rate limit per the runbook.

## 7. Risks and rollback

- Reassigning evaluations to the tombstone keeps community scores stable; the confirm copy must say that anonymized scores stay in the sessions the user took part in. If Ricardo prefers full erasure, aggregates must be refreshed by the trigger (re-fire with `isDraft` in SET) and every affected owner's results change — treat that as a separate decision, not the default.
- `deleteUser` failing after commit: keep a visible retry.

## 8. Native-readiness clause

Deletion is in-app with no browser bounce, guests included; clear IndexedDB and SW caches for the user; local storage clears even if the network call fails; dialogs close on Android back without signing out.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`profileRelations`, `guestClaimToken`, `accountDeletion` tests)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-07 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the Cuenta card, delete dialog, guest warning
- [ ] gated items either done or left as named TODOs listed in the PR description
