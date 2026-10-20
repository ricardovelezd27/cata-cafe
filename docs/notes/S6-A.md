# S6 Stream A — notes for flows.md / CLAUDE.md (merged by the lead at the end)

## CP-A1 design — `lib/reports/*` (pure report models)

Principle: every number a report needs already exists in `results/page.tsx`. Extract the
server-side assembly into pure, tested modules; the page, the PDF routes and `lib/closeEmail.ts`
consume the same models (same discipline as `lib/resultsAggregation.ts`).

### Modules
- `lib/sessionState.ts` — add
  `canViewGroupResults({ isGroup, ownerRead, status, allSubmitted, sessionExpired }): boolean`
  (verbatim rule from `results/page.tsx` `canViewGroup`). Pure; tested.
- `lib/reports/ranking.ts` (pure) — extracted from `ResumenTab`:
  - `myScoreFor(sample, format, cupsPerSample)` (uses `hasAffectiveData`, `canShowMyScore`,
    `calcIndividualScore`).
  - `rankFor(sample, { format, isGroup, canViewGroup, cupsPerSample })` →
    `{ score, sd, basis }` (community first, else mine; descriptive → nulls).
  - `rankSamples(samples, referenceId, ctx)` → `{ referenceRank, ranked: [{sample, position,
    score, sd, basis}], refDeltas: Map<id, number|null> }` (reference excluded, sort by score
    desc then position, Δ via `deltasVsReference`).
  - `sessionStats(samples, ranked, referenceId, ctx)` → `{ evaluatedCount, avgScore,
    bestSampleId, myAvg, communityAvg, delta }`.
  - `consensusLine(blockFreq, isSolo, labels)` moved here (`labels.soloTopDescriptors`).
  `ResumenTab` keeps rendering but calls these — behaviour must be byte-identical.
- `lib/reports/cupperStats.ts` (pure) — extracted from `OwnerParticipantSection.tsx:181-198`:
  `rowStats(values: (number|null)[], includedMask)` → `{ mean, sd, count }` and
  `bandFor(value, stats)` → `"neutral" | "green" | "amber" | "red"` (≥2sd red, ≥1sd amber).
  `OwnerParticipantSection` imports them (no behaviour change).
- `lib/reports/sessionReportData.ts` (`import "server-only"`) — ONE fetch used by the
  participant-summary and ficha-técnica routes: session + ordered samples (`orderReferenceFirst`)
  + coffee + physical + extrinsic + aggregateScore + participants + all `isDraft=false`
  evaluations with `cupper.displayName`; computes `excludedUserIds`, `groupAggBySample`
  (`computeGroupAggregate`, excluded removed, per-format blob), `descriptorFrequency`
  (`computeSampleBlockFrequencies`), `alignmentRows` (`computeCupperAlignment`).
  Returns a `SessionReportSource` object. Authz is NOT in here — routes gate first.
- `lib/reports/participantSummary.ts` (pure) —
  `buildParticipantSummary(src: SessionReportSource, { viewerId, locale, labels })` →
  `ParticipantSummaryModel` = header (session, date, cupperName, format, cupsPerSample,
  participants, referenceLabel), kpis (myAvg, communityAvg, delta, myAlignment triple or null,
  evaluated/total), samples[] (reference first, then ranked): label, coffee (only if revealed),
  myScore, communityScore, sd, deltaVsRef, radar { mine: number[8], community: number[8] } or
  null, topDescriptors[{label, pct, mine: boolean}] (from `blocks.general`, top 5), consensus
  sentence, myNotes. **Invariant (tested):** the model contains no other cupper's name/id and
  no physical data.
- `lib/reports/fichaTecnica.ts` (pure) — `buildFichaTecnica(src, { tier: "owner" |
  "participant", locale, labels })`: per-sample Identity / Extrinsic / Green (owner only) /
  Affective (community score, sd, included/submitted, attrAverages, penalties) / Descriptive
  (per-block ranked descriptors with pct, consensus sentences, intensity means — new small
  calc over `*_int`) / Participation; owner appendix = cupper×sample matrix (`cupperStats`) +
  alignment ranking. Participant tier strips the appendix and Green.
- `lib/reports/teacherNotes.ts` (pure) — `buildTeacherNotes(src)` → per cupper: per-sample
  score vs community with band, alignment overall/by sample, consensus descriptors missed /
  own descriptors outside consensus (needs `lib/alignment.ts` to additionally export the
  majority sets per sample+block — additive change), excluded flag.

### Tests (`tests/reports.test.ts`, fixtures only, no Prisma)
- `canViewGroupResults` truth table.
- `rankSamples`: reference excluded, score sort + position tie-break, Δ basis guard.
- `rowStats`/`bandFor` thresholds.
- participant model: fixture with 3 cuppers → model for cupper B contains neither "A" nor "C"
  names/ids, no `physical` key; coffee name absent when unrevealed.
- ficha participant tier has no appendix / green block.

### Non-goals in A1
No new routes, no PDF documents (A3/A4). `results/page.tsx` output must not change
(screenshot diff before/after).

## CP-A3 verification

Route: `GET /api/sessions/[id]/participant-summary?locale=es|en&inline=1`
(`app/api/sessions/[id]/participant-summary/route.ts`). Authz mirrors
`cva-pdf` (creator or participant; super-admin renders the owner's lens) plus
`canViewGroupResults` for group sessions. Visual check:
`npx tsx scripts/render-participant-summary-preview.tsx <outDir> [es|en]`.

Manual curl matrix (use a logged-in session cookie `-b cookies.txt`):

| Case | Request | Expect |
|---|---|---|
| No cookie | `curl -i /api/sessions/<id>/participant-summary` | 401 `Unauthorized` |
| Not owner/participant (non-admin) | cookie of an unrelated user | 404 `Not found` |
| Unknown id | any id that does not exist | 404 |
| Group, not visible yet (active, owner not viewing, not everyone submitted, `closesAt` empty/future) as a participant | participant cookie | 409, text/plain "Los resultados del grupo aún no están disponibles" (`?locale=en` → "Group results are not available yet") |
| Group, owner or closed/all-submitted/expired | cookie | 200 `application/pdf`, `Content-Disposition: attachment; filename="resumen_<slug>.pdf"` |
| Solo session, owner | owner cookie | 200 (community side omitted) |
| Inline | add `&inline=1` | `Content-Disposition: inline` |
| Locale | `&locale=en` | filename `summary_<slug>.pdf`, English copy |

All responses carry `Cache-Control: no-store`. Not verified live (no login for
the agent); the gate itself is `canViewGroupResults`, unit-tested in
`tests/reports.test.ts`.
