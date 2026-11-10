# S8-09 — Offline sync that never loses work

> **When:** after S8-05 (it adds the `"closed"` replay outcome and the `closed_unsent` status this prompt generalises) and S8-04 (solo replay applies; forced replace re-fires the trigger) · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** `prisma migrate deploy` BEFORE the deploy (runbook §14), a physical iPhone for the device checks; C1 shared with S8-05
> **Findings:** 12 (0 P1 · 6 P2 · 6 P3) from `docs/audits/flows-2026-11/` files 03, 04, 07, 11, 15, 16 · **Gated on Kim:** C1 (shared with 05); E5 informs, does not block

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list (docs/audits/
flows-2026-11/15-offline-sync.md §4 is the regression list: storage failures never reject, the SW exclusion
rules, member-gated server-derived replay, submit refuses while device-only, per-module replay with jitter,
sign-out keeps drafts). Theme: replay must be ordered, every outcome must be visible, and a draft is never
dropped silently. The conflict rules of app/actions/offline.ts are KEPT (no row → create; existing draft →
local wins; already submitted → conflict unless force; isDraft/submittedAt never mutated by replay) and the
offline store stays client-only and SSR-safe. Server actions called interactively throw opaque digests in
production, so replay outcomes are RETURNED statuses, never thrown codes. Out of scope: queued creation of
a session while offline (L, awaits Kim E5), reopening closed sessions, native shell code (S8-15). The lead
(Fable) owns the replay protocol, the migration and the status machine; Sonnet may do the badge, banner,
dialogs and i18n; Haiku the docs lines. Work the plan in order, one commit per step, `npx tsc --noEmit &&
npm run lint && npm test` before each commit, update docs/flows.md in the same PR, and finish with the
Definition of done checklist in the PR description. Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-offline-2 | P2 | PLAUSIBLE | Replay marks `synced` without comparing `updatedAt` (`lib/offline/store.ts:188-192`, `hooks/useOfflineSync.ts:132`); no server ordering (`offline.ts:79-94`) | `15-offline-sync.md` |
| F-offline-3 | P2 | CONFIRMED | `conflict` lives in React state; reload drops it, badge ignores it (`useOfflineSync.ts:51,122`, `PendingDraftsBadge.tsx:49`) | `15-offline-sync.md` |
| F-offline-4 | P2 | CONFIRMED | Permanent errors retried forever (`useOfflineSync.ts:91-95`); a stuck module also blocks final submit (`CupClient.tsx:1245`) | `15-offline-sync.md` |
| F-offline-5 | P2 | CONFIRMED | Sign-out and claim leave drafts orphaned (`SignOutButton.tsx:29-35`, `lib/guestClaim.ts`) | `15-offline-sync.md` |
| F-guest-5 | P2 | CONFIRMED (claim half; dup of F-offline-5) | Claim deletes the anonymous id whose pending blobs never replay | `03-invitado-qr-claim.md` |
| F-04-3 | P2 | PLAUSIBLE | Creating a session offline ends in a generic `unknown` toast (`ExpressForm.tsx:67-74`, `Toast.tsx:110-117`) | `04-empezar-cata.md` |
| F-sesiones-5 | P3 (was P2) | CONFIRMED | Draft for a deleted session/sample stays pending forever (`offline.ts:39`, `sessionAuth.ts:118-124`) | `11-editar-administrar.md` |
| F-offline-6 | P3 (was P2) | CONFIRMED | A failed replay never retries by itself (`useOfflineSync.ts:217-224`) | `15-offline-sync.md` |
| F-offline-8 | P3 (was P2) | PLAUSIBLE | No `navigator.storage.persist()`, unbounded static cache (`public/sw.js:95-108`) | `15-offline-sync.md` |
| F-offline-9 | P3 | needs-runtime-check | Shared tablet serves the previous user's cached pages (`public/sw.js:113-123`) | `15-offline-sync.md` |
| F-movimiento-sensorial-4 | P3 | CONFIRMED | Offline-rebuilt `/cup` drops the warm-up (`CupClient.tsx:648-663`, `cup/error.tsx:123-141`) | `16-movimiento-sensorial.md` |
| F-solo-5 | P3 | CONFIRMED | One synced sample clears the amber pending state while another is device-only (`CupClient.tsx:1063-1066`) | `07-sesion-solo.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| C1 (shared with 05) | When a session closes while a cupper holds unsent notes, what may they do? (a) only view/copy · (b) send to the owner as late contribution · (c) owner decides | (b) + (d) in the C1 wording: kept apart, owner decides | Build view and copy only (S8-05 `closed_unsent`, extended here to `orphaned`); sending to the owner is a named TODO because it is a post-close write |
| E5 (informs F-04-3) | How often do you cup without signal; must a whole session be creatable offline? (a) never · (b) sometimes, keep cupping if it drops · (c) often | (b) | Ship only the offline detection and message in step 8; queued creation stays out |

## 4. Plan

1. **Ordering end to end (one migration).** `Evaluation.lastClientWriteAt DateTime? @db.Timestamptz(3)` (runbook §14). `upsertEvaluation` and `syncEvaluation` accept an optional `clientTs` (older bundles omit it → behaviour unchanged); a write whose `clientTs` is older than the row's `lastClientWriteAt` is ignored and returns `synced` (the newer data already won); otherwise it stamps the column. Client: `replayModule` snapshots `updatedAt` before the await and `setModuleStatus(..., "synced", { ifUpdatedAt })` flips only when it still matches; otherwise the module stays `pending` and replays the newer data next round. Cross-device clock skew is accepted and documented (same user, same sample). Files: `prisma/schema.prisma`, `app/actions/offline.ts`, `app/actions/sessions.ts`, `hooks/useOfflineSync.ts`, `lib/offline/store.ts`. Invariant: scoring inputs still derived server-side; only a timestamp is added. Covers: F-offline-2.

2. **Status machine in the store.** `SyncStatus` in `lib/offline/types.ts` becomes `pending | synced | conflict | failed | closed_unsent | orphaned`, with optional `attempts`, `lastError`, `nextAttemptAt` on `OfflineModuleData` (additive, old blobs still load). Pure transition helper in `lib/offline/status.ts`, tested. Conflicts are written to the blob when detected and rebuilt from blobs on mount (`useOfflineSync` + `SyncConflictModal`), counted in the badge and results pill, and the modal stays reachable until resolved. Invariant: store stays client-only and never rejects. Covers: F-offline-3.

3. **Classified replay outcomes.** `syncEvaluation` returns `synced | conflict | closed | gone | rejected` (never throws for these); add `replayPhysical` / `replayExtrinsic` in `app/actions/offline.ts` with the same `requireSample*` authorization, returning the same statuses, instead of calling the interactive `upsertPhysical/upsertExtrinsic` from the hook (their thrown codes are opaque in production). Client: network/5xx → retry with the existing jittered backoff; `closed` → `closed_unsent` (S8-05); `gone` → `orphaned`; `rejected` → `failed` with a one-time notice and no auto-retry; after 5 total attempts a retryable error also becomes `failed` (manual "Reintentar" only). Terminal statuses are excluded from the final-submit gate (`countLocalPending`) but listed in a notice, so a deleted sample can never block a cupper's submit. Conflict rules of `syncEvaluation` are unchanged. Covers: F-offline-4, F-sesiones-5.

4. **Orphans are kept, readable, dismissible.** `orphaned` and `closed_unsent` modules render in a "Notas sin sincronizar" panel (reachable from `PendingDraftsBadge` and the sessions list): session label, sample, date, read-only view and copy-to-clipboard of the text. Removal needs explicit confirmation; nothing is auto-deleted. Replay runs on resume, not only on the `online` event (step 5). Covers: F-sesiones-5, F-offline-1 (storage half).

5. **Self-healing retries and honest indicator.** New `hooks/useResume.ts` (visibilitychange, pageshow, online; S8-15 will add the Capacitor `appStateChange` source behind the same hook). While any module is `pending` and online, `useOfflineSync` retries on a bounded jittered schedule (15 s doubling to 5 min) and on resume; banner and badge show "próximo intento en N s". In `CupClient`, replace `setHasPending(false)` / `setSaveStatus("saved")` on any synced flush with a value derived from `countLocalPending()` after each flush; the leave guard uses `bodyPending` whenever that count is above zero. `PendingDraftsBadge` counts all non-synced statuses and colours terminal ones differently. Covers: F-offline-6, F-solo-5.

6. **Sign-out and claim guards.** `SignOutButton` calls `countDeviceOnly(userId)`; if above zero: online → "Sincronizar ahora" then continue, offline or still failing → dialog "N cambios quedan solo en este dispositivo" with Cancelar / Salir de todos modos (drafts stay on disk, as today). `useGuestClaim.start` does the same for the anonymous id before minting the token ("Esperar" / "Seguir y perder estos"). After `confirmGuestClaim` succeeds, the client calls `rekeyUserBlobs(anonId, newUserId)` (new, client-only, in `lib/offline/store.ts`) before leaving, so replay runs under the new account; blobs in another browser are caught by the pre-claim guard. Guest scope and `mergeGuestData` untouched. Covers: F-offline-5, F-guest-5.

7. **Storage and shared tablets.** On the first successful draft write call `navigator.storage.persist()` once, record the answer in the store and in `localStorage` (try/catch); when not persisted and not installed (`display-mode: standalone`), warn if a pending draft is older than 3 days. `public/sw.js`: cap `cata-static-*` at 120 entries (FIFO) and never cache `/app/insights/**` or profile pages; bump `SW_VERSION` to `v3` (CLAUDE.md rule: cache-key logic changed; one-time cache eviction is expected). Purge `cata-pages-*`/`cata-rsc-*` whenever the signed-in id differs from `getLastUser()` (reuse `clearLocalDeviceState`). Invariant: SW exclusion rules (non-GET, cross-origin, `/api/*`, `/auth/*`, `hmr`) untouched. Covers: F-offline-8, F-offline-9.

8. **Offline create and warm-up cache.** `ExpressForm.tsx` and `NewSessionForm.tsx` use the shared `useConnectivity` probe (not `navigator.onLine`): offline disables submit with "Sin conexión: se necesita internet para crear la sesión", keeps every value, and the same tap works after reconnect; a caught network failure maps to an `offline` code under `errors.codes` (es/en). `cacheProps` also stores `warmup.exerciseId` and `cup/error.tsx` rebuilds `warmup` from it so the seen-set logic runs as online; never cache `warmupStartedAt` or `serverNow`. Covers: F-04-3, F-movimiento-sensorial-4.

## 5. Acceptance (tests to write or checks to run)

- F-offline-2: an edit during an in-flight replay leaves the module `pending` and replays it later; an older request arriving after a newer one does not regress the row (`tests/offlineOrdering.test.ts` on the pure compare helper and `lib/offline/status.ts`).
- F-offline-3: create a conflict, reload; modal and badge still show it; resolving clears both.
- F-offline-4 / F-sesiones-5: a closed-session physical edit ends in the S8-05 notice, not "failed"; a deleted-sample draft is reported once, stops retrying, does not block final submit; delete a session while a second device holds a draft, reconnect → queue clears in one replay, notice appears, badge drops (pure classifier in `tests/replayOutcome.test.ts`).
- F-offline-5 / F-guest-5: guest with a pending module claims → waits for sync or is told how many sheets are at risk; module replays under the new account; sign-out with pending shows the warning.
- F-offline-6: server forced to 500 then healthy clears pending within the backoff window without a click.
- F-offline-8 / F-offline-9: persist result recorded; static cache bounded across two deployments; A's session expires, B signs in and goes offline, A's lists are not served.
- F-04-3: offline tap shows the specific message and keeps values; reconnecting lets the same tap succeed.
- F-movimiento-sensorial-4: an unseen exercise opens after an offline hard refresh; seen or absent does not.
- F-solo-5: A pending and B synced stays amber and clears only after A syncs.
- Regression: every item in audit 15 §4 still holds.

## 6. Manual steps for Ricardo

- `prisma migrate deploy` BEFORE the deploy (runbook §14), from the right checkout; no Supabase SQL.
- Device checks on a physical iPhone and a low-end Android (audit 15 §5): lock/resume replay, IndexedDB survival over days, persist outcome. Bumping `SW_VERSION` evicts every user's caches once.

## 7. Risks and rollback

- `clientTs` ordering ignores a genuinely newer edit made on a device with a slow clock; mitigated by comparing only per sample and cupper and by logging ignored writes. Roll back by ignoring the column (it is nullable and additive).
- More statuses means more badge states; keep `synced` removal semantics unchanged so old blobs behave as before.
- Never run the migration or any replay test against production data.

## 8. Native-readiness clause

- Everything above must hold in a Capacitor WebView: replay on `appStateChange` through `useResume`, `rekeyUserBlobs` before the claim deep link leaves the app, persistent drafts mirrored write-through to native storage by S8-15, copy/export of orphaned notes through the shared share seam (not `<a download>`), and no `navigator.onLine`-only logic.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/offlineOrdering.test.ts`, `tests/replayOutcome.test.ts`, status-machine tests)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-09 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the badge states, orphan panel and sign-out warning
- [ ] gated items either done or left as named TODOs listed in the PR description (C1 send-to-owner; E5 queued creation)
