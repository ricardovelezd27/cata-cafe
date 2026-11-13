# Brief — S10 WP8b: follow-ups to the guest identity guard and the reload notices (no schema change, no SQL)

Branch: `claude/s10-08b-identity-followups-impl` from `origin/main` (which now contains PR #116
"guests on a shared device" and PR #119 "reload notice app-wide"). DRAFT PR against `main`.
PR title: `S10 WP8b: identity follow-ups — claim in another tab never strands edits, a paused tab resumes, visible notice`
`npm run test:db` required.

Read first: CLAUDE.md ("Guests", "Offline-First Pattern", "Guest → account (claim)", "Save
Status Honesty", "Platform seam"), `lib/expectedUser.ts`, `lib/identityChange.ts`,
`lib/identityResolve.ts`, `lib/offline/claimMarker.ts`, `lib/offline/store.ts`
(`rekeyUserBlobs`, `mergeModuleData`), `components/layout/IdentityWatcher.tsx`,
`components/offline/OfflineBanner.tsx`, `components/offline/StaleBundleNotice.tsx`,
`lib/staleNoticePlacement.ts`, `components/offline/UnsyncedGuardProvider.tsx`,
`app/[locale]/app/sessions/[id]/cup/CupClient.tsx` (save paths, rehydration, pagehide flush),
`app/[locale]/app/sessions/[id]/cup/error.tsx`, `hooks/useOfflineSync.ts`,
`app/actions/offline.ts`, `app/actions/join.ts`, `components/join/GuestJoinForm.tsx`,
`components/layout/SignOutButton.tsx`, `app/actions/auth.ts`.

## Context
The guard from PR #116: the cup page sends the user id it was rendered for with every write;
the server refuses with `identity_changed` only when a DIFFERENT user is signed in; the client
then pauses saving ("latch") and shows a reload notice. A guest who completes the account
claim in another tab is the same person: the old tab re-keys its local drafts from the
anonymous id to the account id and reloads. The fifth review approved the merge and listed
what follows. In every case below the drafts stay on the device today; the work is to make
sure they are also FOUND again.

## 1. (Medium) After a claim, edits typed in the old cup tab can be stranded or overwritten
Two ways to miss the automatic claim path:
(a) Marker age: claim freshness is measured from the START marker (`CLAIM_ANON_KEY`, written
when the claim starts). If the old tab first notices more than an hour after the claim
STARTED, the same person gets "Este dispositivo cambió de persona", the tab latches, later
typing is stored under the deleted anonymous id, and on reload the provider clears both
markers without re-keying: those drafts are never seen again.
(b) A tab that latched while the claim was still in progress (cookie already holds the
account, no done marker yet) and is then reloaded with the banner's plain
`window.location.reload()`: the reload runs no before-reload hook and no re-key; on the
reloaded page `CupClient` calls `loadSession(session, account)` BEFORE the provider's re-key
(effects run child first), so the form hydrates without the latched edits; the provider then
moves them into the account's blob, but `CupClient` never re-hydrates, and the next keystroke
replaces the whole module (`mergeModuleData`) with the stale form.
Fix:
- Measure claim freshness from the DONE marker's time (the claim finished then); decide the
  TTL rule in the pure module with tests (a claim that never completed still expires from its
  start marker as today).
- One shared `reloadIdentity()` (in `lib/` + thin client wiring) used by BOTH reload buttons
  (`OfflineBanner`'s identity button and `IdentityWatcher`'s bar): run the registered
  before-reload hooks (await pending local writes, capped as today), then, if the markers say
  this device's rendered id was claimed by the current id, `rekeyUserBlobs`, then reload.
- `CupClient` rehydration: before `loadSession`, await the claim re-key for the current user
  when the markers call for it (so the first hydration already sees re-keyed drafts), OR
  re-hydrate when the provider's re-key / `OFFLINE_SYNC_EVENT` reports new local data for this
  session and the form has not been edited since mount. Choose one, justify it, and prove with
  a test at the pure-rule level plus a store-level test (fake IndexedDB as existing store
  tests do) that: latched edits under the anonymous id → after reload + re-key → present in
  the account's blob AND not overwritten by the first later save.
- `rekeyUserBlobs` on a key collision (a blob already exists under the account id for the same
  session/module): state what it does today; the newer edit must win per module
  (`updatedAt`), never a blind overwrite in either direction. Test.
- Clear the pagehide refs in the before-reload hook so the reload's pagehide flush does not
  write a second copy under the old id (the reviewer saw harmless garbage; remove it).

## 2. (Low) A tab paused by a sign-out stays paused after the same person signs back in
The sign-out marker makes other tabs re-read; with nobody signed in they latch; nothing
clears the latch until the tab is hidden for 2+ s and shown again. Fix: also write the
identity marker when a sign-in COMPLETES on this device (`confirmEmailToken` success,
`verifyEmailCode`, `acceptPendingSignIn`, the Google callback's landing: find the client-side
points; the marker is written by client code after the server action returns ok), and let a
receiving tab that re-reads `same` clear its latch (the table already clears on `same` at
resume: reuse it for the marker path). Pure-rule tests for the new marker kind.

## 3. (Low) The cup notice is only visible at the top of the scroll area
`OfflineBanner` is the first child inside the cup shell's scroll container. When the latch is
first set, also toast once (`feedback.notifyError("identity_changed")` or the existing warning
toast with the same copy), so a cupper scrolled down the form sees it. Once per latch, not per
save.

## 4. (Low) A different signed-in user found only by the offline replay never sets the latch
`replayUser` answers `pending` for both "nobody" and "a different user", so in `doGoToResults`
with nothing in the debounce the person sees the generic "still pending, retry" forever. Make
the replay actions return a DISTINCT status for a positively different signed-in user (extend
the replay result union; `lib/offline/status.ts` maps it to keeping the module `pending`, no
attempt burned, exactly as today), and have `useOfflineSync` call `onServerIdentityChanged`
when it sees it. "Nobody signed in" stays `pending` as today. Update the DB tests in
`tests/db/expectedUser.dbtest.ts`.

## 5. (Low) The join race is guarded only up to onboarding
`components/join/GuestJoinForm.tsx` (~l.139-148): `joinSessionAsGuest(token, locale)` carries
no guest id, so if the cookie flips between `completeGuestOnboarding` and the join, the other
user is joined. Pass the expected guest id; on a mismatch the action refuses
(`identity_changed`), writes nothing, and the form says so in plain words instead of silently
refreshing to the "¿Eres …?" screen (reuse `errors.codes.identity_changed`). DB test.

## 6. Leftovers from PR #119's review (same notice files)
- `app/[locale]/app/sessions/[id]/cup/error.tsx`: in its FAILED state (after the automatic
  retries) show the "new version, reload" notice when the stale-bundle latch is set, and the
  identity notice when the identity latch is set (the boundary rebuilds from cached props that
  may lack `bannerIdentityChanged`: fall back to the `errors` translations the boundary already
  loads with `useTranslations("errors")`).
- `lib/staleNoticePlacement.ts`: the comment claims the layout notice is always visible; the
  warm-up player (fixed, z 60) covers it while on screen. Correct the comment; no code change
  unless making the notice visible there is trivial and safe (say what you did).
- Add a test for a path WITHOUT a locale prefix (default locale, `localePrefix: "as-needed"`)
  to the placement tests.
- CLAUDE.md / README wording for `ANALYTICS_SUPER_ADMIN_EMAIL`: "missing, blank or invalid".

## Nits
`app/actions/sessions.ts` (~l.680): the comment still says "(or nobody is signed in)" returns
`identity_changed`: wrong since the fourth round. Docs: CLAUDE.md "Guests" and
`docs/flows.md` shared-device section, made true for everything above.

## Do not change
The server rule (`decideServerIdentity`), the join screen's identity choice, the absent
`expectedUserId` behaviour, the stale-bundle detection.

## Gates and delivery
All five gates (`npx tsc --noEmit`, `npm test`, `npm run test:db`, `npm run lint` with exactly
the 4 known errors in `app/[locale]/dev/page.tsx` and `components/ui/IntensitySlider.tsx`,
`npm run build`). Report: branch, PR number, commits; for item 1 the chosen hydration fix and
the collision rule with their tests; the new marker kind and every place that writes it; the
replay status and how the hook reacts; every string added or changed (es and en); gate tails
with exact counts; anything not done or doubtful; the list of checks that need two people on
one real device.
