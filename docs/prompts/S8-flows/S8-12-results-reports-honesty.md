# S8-12 — Results and reports tell the truth

> **When:** after S8-02 (leaks) and S8-04 (scoring) · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** `migrate deploy` of one migration; Kim answers D1, D2, D3, D5 (defaults suffice)
> **Findings:** 12 (0 P1 · 5 P2 · 7 P3) from `docs/audits/flows-2026-11/10-resultados.md`, `14-informes-pdf.md`, `12-cafes.md` · **Gated on Kim:** D1, D2, D3, D5

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read 10-resultados.md, 14-informes-pdf.md and 12-cafes.md in
docs/audits/flows-2026-11/ finding by finding (§7 verdicts and §4 "Keep" included): every change maps to a
finding id. Theme: what results and PDFs claim must match what the data supports. Display rules live in pure
`lib/reports/*`; scoring (`lib/scoring.ts`, the trigger) is NOT touched.
Closed = read-only is deliberately extended with named post-close writes (origin edit, exclusion); update
docs/flows.md §1 and CLAUDE.md in this PR. Sonnet may do i18n, radar, CSV and tests; the lead keeps steps 3, 4. One commit per step, `npx tsc --noEmit && npm run lint &&
npm test` before each, Definition of done in the PR description. No bare `git stash`.
```

## 2. Findings covered

| Id | Sev. (final) | Verdict | One line | File |
|---|---|---|---|---|
| F-resultados-4 | P2 | CONFIRMED | "Editar origen" offered on closed sessions; `upsertExtrinsic` always throws | `10` |
| F-resultados-5 | P2 | CONFIRMED | Exclusion: no reason/author/time, silent failure, no n of N | `10` |
| F-resultados-6 | P2 | CONFIRMED | Ties ranked 1/2, "best" with n=1, SD without n, mixed score basis | `10` |
| F-informes-3 | P2 | CONFIRMED | Participant summary has no n of N and no generation stamp | `14` |
| F-cafes-4 | P2 | CONFIRMED | Revoking a person leaves the invite alive; links never expire | `12` |
| F-resultados-7 | P3 | CONFIRMED | Radar hard-codes Spanish; `revealSample` works when closed | `10` |
| F-resultados-8 | P3 | CONFIRMED | PDFs lack language/date; drafts unmarked | `10` |
| F-resultados-10 | P3 | CONFIRMED | Unguarded `localStorage`, dead Editar, no `next=` | `10` |
| F-informes-5 | P3 | CONFIRMED | `cva-pdf` has no try/catch or `maxDuration` | `14` |
| F-informes-6 | P3 | CONFIRMED | Legacy email CVA loses multi-reference labels | `14` |
| F-informes-7 | P3 | CONFIRMED | No PDF language, no radar text twin, no raw export | `14` |
| F-cafes-5 | P3 | CONFIRMED | Private round trip revives old links and shares | `12` |

Files are under `docs/audits/flows-2026-11/`. Not here: F-resultados-9, F-informes-4 (S8-15); F-informes-1/2, F-cafes-1..3 (S8-02).

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| D1 | Can the owner correct origin after close? Do closed-session reports show current data or the day's? | (a) yes, always; current data with an "editado" note (c) | Build (a)+(c). If Kim says no: hide the button, keep the server guard, drop the allow-list in step 4 |
| D2 | Why exclude a cupper, notify them, allowed after close? | Fixed reason list; no notice; allowed after close | Reason list as a constant; no email |
| D3 | From how many cuppers show average/SD; when "sin diferencia clara"? | Min 3, "indicativo" 3–4, normal from 5; "sin diferencia clara" when gap < 0.5 × panel SD | One exported `RANKING_POLICY` constant |
| D5 | Data file of each cupper's score per sample, names or codes? | (b) yes, names for the owner | Owner CSV with names; codes = one flag |

## 4. Plan

1. **Ranking honesty, pure** — in `lib/reports/ranking.ts` add `RANKING_POLICY` and extend `rankSamples`/`sessionStats`: equal displayed scores share a rank (1,1,3); rows carry `n`, `basis` (`community | mine`), `indicative` (n < 5), `suppressed` (n < 3: no SD, no "best"); neighbours closer than 0.5 × the larger sample SD (`sd·√(n/(n−1))` from the population `scoreSd`) get `noClearGap`. `ResumenTab.tsx` (`:181-189`, `:129-140`, `:202-210`) and the PDF models read the same output; references stay out of rank, average and best. Covers: F-resultados-6, F-informes-3.
2. **n of N everywhere** — `results/page.tsx` adds `inclusion: { included, total }` per sample (submitted, non-excluded vs submitted evaluators); show "n de N incluidos" beside every community score (ranking, stat card, owner matrix, `SampleRadarChart.tsx:262-266`, `ParticipantSummaryDocument.tsx:564-565`, ficha). The participant PDF says when the viewer's own evaluation is excluded (no reason, no peer identity). Covers: F-resultados-5, F-informes-3.
3. **Exclusion trail (the migration)** — add `excluded_at`, `excluded_by` (plain text id, NO FK, so `mergeGuestData` is unaffected), `exclusion_reason` to `session_participants` and `edited_at` to `extrinsic_data`. `setParticipantExclusion` (`app/actions/community.ts:426`) becomes `run()` → `ActionResult` with `requireSessionOwner`, reason validated by `oneOf` (`sample_error | protocol | calibration | other`), author/time stamped, cleared on restore, allowed after close (D2) as a named post-close write. `OwnerParticipantSection.tsx:148-160` asks the reason in a `ResponsiveDialog` and uses `useActionFeedback`; the owner matrix shows who, when, why; after close, results and PDFs say "Resultados actualizados el <fecha>". Touches closed = read-only. Covers: F-resultados-5.
4. **Origin edit after close** — in `upsertExtrinsic` (`sessions.ts:1367-1372`) replace the blanket `assertSessionWritable` with the `updateSampleMetadata` pattern (`:1261`): owner AND `sample.revealed`, otherwise `session_closed`; stamp `edited_at` when closed; return `ActionResult`. `ExtrinsicEditDialog.tsx` shows localized errors; fix stale comments (`:12-14`, `sessions.ts:1254-1257`, `docs/flows.md` ~235/251). Reports show "Origen editado el <fecha>". Covers: F-resultados-4.
5. **Results hygiene** — localize the radar card (`SampleRadarChart.tsx:213,233-238,258,262-266`); `revealSample` gets `assertSessionWritable` + `run()`, Revelar hidden when closed; guard `localStorage` (`ResultsClient.tsx:86-88`); no `onEdit` when closed (`:1001`); `results/page.tsx:33` redirect carries `next=` (skip if S8-06 did). Covers: F-resultados-7, F-resultados-10.
6. **Report stamps** — shared `lib/pdf/sections/ReportStamp.tsx` (server clock date and time, locale, inclusion line, "Borrador" for drafts) in every `*Document.tsx`; `Document language` if `@react-pdf/renderer` 4.5.1 types allow it; `cva-pdf/route.ts:58` passes `isDraft`; dated filenames via `lib/pdf/filename.ts`; eight radar values as text; `cva-pdf` gets try/catch with digest, a `lib/log.ts` line and `maxDuration` like `participant-summary`; the legacy `closeEmail.ts` branch uses the S8-02 sheet helper (or `orderReferencesFirst` + `referenceRank`). Covers: F-resultados-8, F-informes-3, F-informes-5, F-informes-6, F-informes-7.
7. **Owner CSV** — `app/api/sessions/[id]/results-csv/route.ts` with the `ficha-tecnica` gate (401, owner or super-admin, else 404), `nodejs`, `force-dynamic`, `no-store`; one row per cupper × sample (attributes, cups, score, excluded flag and reason); coffee name only if revealed; UTF-8 BOM; cells escaped with `csvCell` from `lib/analytics/usersCsv.ts:12` (extract to `lib/csv.ts`). Covers: F-informes-7.
8. **Coffee links** — `rotateCoffeeInvite` (`coffees.ts`, `run()`) invalidates the previous invite and is offered in the revoke confirmation; new invites expire in 30 days, shown in `CoffeeShareManager.tsx`; `joinCoffeeViaToken` checks `maxUses` inside the transaction; `setCoffeeVisibility` deletes invites when leaving shared/public and lists previous people to keep or clear when returning. Shares stay inert, no RLS change. Covers: F-cafes-4, F-cafes-5.
9. **Docs** — `docs/flows.md` §1, §5, §6; CLAUDE.md sanctioned-writes sentence; Fixed-in lines in the audits.

## 5. Acceptance (tests to write or checks to run)

- F-resultados-6: `tests/ranking.test.ts` — equal scores share a rank; n=1 `suppressed`; n=3 `indicative`; gap under half SD flags `noClearGap`; page and PDF read one output.
- F-resultados-5: closed-session exclusion stores author, time, reason; restore clears; failed toggle toasts localized copy; every community number shows "n de N".
- F-resultados-4: owner saves origin on a closed revealed sample; others get `session_closed`.
- F-resultados-7/10: `/en` radar has no Spanish; `revealSample` on closed throws; results render with `localStorage` throwing.
- F-informes-3/5/6/7: each PDF shows date, language, inclusion line; draft reads "Borrador"; forced render error returns text with digest; CSV 404s for a participant.
- F-cafes-4/5: old URL invalid after rotate; revoked user cannot rejoin.

## 6. Manual steps for Ricardo

- `npx prisma migrate deploy` before the deploy (four nullable columns, backwards compatible). No SQL PHASE.

## 7. Risks and rollback

- `RANKING_POLICY` (min n 1, gap 0) restores the old ranking. Emailed summaries go stale after a post-close exclusion; the "actualizados el" banner mitigates. Columns are nullable; revert code only.

## 8. Native-readiness clause

- No hover-only text at 375 px; PDF and CSV links are plain URLs that S8-15's `downloadFile` wraps; stamps use the server clock; `next=` survives an OAuth round trip.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/ranking.test.ts`, `tests/reports.test.ts`, new exclusion and origin tests)
- [ ] docs/flows.md updated; audit file(s) get a line `Fixed in S8-12 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for Resumen, owner matrix, exclusion dialog, share manager
- [ ] gated items (D1–D5) either done or left as named TODOs in the PR description
