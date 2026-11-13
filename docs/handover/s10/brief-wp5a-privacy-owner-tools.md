# Brief — S10 WP5a: exclusion reasons and notice, CSV without names, group roster privacy, "editado" on origin data (no schema change expected, no SQL)

Branch: `claude/s10-05a-privacy-owner-tools-impl` from `origin/main`. DRAFT PR against `main`.
PR title: `S10 WP5a: exclusion reasons and private notice, CSV with codes, group members never see emails (F-grupos-10), "editado" on origin data (F-cafes-9)`
Kim rows: D2, D5, D7 and finding F-cafes-9 (answers are simulated: mark new behaviour
`TODO(kim-validar:<row>)`). `npm run test:db` required if any query or action changes.

Read first: CLAUDE.md ("Session Lifecycle": sanctioned post-close writes, ranking honesty;
"Auth Pattern": co-cupper scope, masked emails; "CVA PDF Export & Reports"; "Server Action
Contract"; "i18n Pattern"; "Styling"), `docs/flows.md` §1 and §6, `lib/exclusionReasons.ts`,
`app/actions/community.ts` (`setParticipantExclusion`), `components/results/OwnerParticipantSection.tsx`,
`app/[locale]/app/sessions/[id]/results/page.tsx` + `ResultsClient.tsx`,
`lib/reports/resultsCsv.ts` + `app/api/sessions/[id]/results-csv/route.ts`,
`app/[locale]/app/groups/[id]/page.tsx`, `lib/maskEmail.ts`, `lib/coCuppers.ts`,
`components/results/ExtrinsicEditDialog.tsx`, `app/actions/sessions.ts` (`upsertExtrinsic`:
`extrinsic_data.edited_at`), `lib/pdf/cvaFormData.ts`, the coffee ficha
(`lib/reports/fichaTecnica.ts`, `/api/coffees/[id]/ficha`), `app/actions/coffees.ts`
(`updateCoffee`). Before building each part, check whether it already exists.

Other packages are in flight on neighbouring files (do not build their parts; keep your edits
local): the cupper's score breakdown (`SampleDetail`, `ScoreBreakdownPanel`, defect types in
`cvaFormData.ts`); closing rules (`results/page.tsx`: a "Cerrar ahora" control and a
close-email line; `OwnerParticipantSection` is NOT theirs).

## 1. D2 — exclusion reasons, wording, and a private notice
Owner decision: a fixed list plus free text. Scoring differently from the group is NEVER a
reason and never called an error.
- `lib/exclusionReasons.ts`: reasons for NEW exclusions are exactly: wrong sample
  ("Muestra equivocada"), protocol not followed ("No se siguió el protocolo (tueste, molienda,
  agua)"), incomplete cupping ("Cata incompleta"), not in a condition to cup ("No estaba en
  condiciones de catar": the owner decided NOT to store a health reason about a named person;
  use this wording, never "resfriado", "enfermo" or "salud"), test or duplicate ("Prueba o
  duplicado"), other with a short free text (max 120 chars, required when "other"). The old
  reason about "calibración distinta" / scoring differently is REMOVED from the choices; stored
  rows that carry it (or any unknown legacy value) still render with their old label. Pure
  module with tests (choices for new exclusions vs labels for stored values; validation of the
  free text through `lib/validate.ts`).
- `setParticipantExclusion` validates against the new list (it is a sanctioned post-close
  write: keep its guards, stamps and `ActionResult` contract exactly). If the free text needs
  storage and no column exists for it, store "other: <text>" in the existing reason column
  only if its type and length allow it; if it does not fit, STOP and report (no migration in
  this PR).
- The exclusion dialog (`OwnerParticipantSection`): the new choices; after close it already
  says results change: add the line the owner decision requires, es: "Los resúmenes que ya se
  enviaron tenían el número anterior." (+ en) when the session is closed.
- Outlier wording: find the "posible atípico" / ≥ 2 SD hint in the owner matrix and its help
  text. It must describe a DISTANCE from the group, not a mistake: es "Lejos del grupo en esta
  muestra (2 DE o más). No es un error: en la cata afectiva las preferencias pueden diferir."
  (+ en). No red "error" styling for it (the `warning` token is fine).
- Private notice to the excluded cupper: on THEIR OWN results page of that session (never by
  email, never visible to anyone else, never in a PDF or CSV that others get), one calm line,
  es: "El organizador dejó tu evaluación fuera del resultado del grupo ({motivo}). Tus propios
  resultados no cambian." (+ en; `{motivo}` = the reason's label, or the free text for
  "other"). Shown only to that cupper; the results payload for a participant must carry
  ONLY their own exclusion state and reason, never anyone else's (check the PHASE 25 column
  rule: the exclusion trail is read through Prisma on the server only; test the payload
  builder: another participant's exclusion never appears in a participant's payload).
  Remember: a message with an ICU argument rendered in a client component is filled on the
  server or fetched with `t.raw()` and replaced client-side.

## 2. D5 — results CSV with a code column, and a download without names
- `lib/reports/resultsCsv.ts` (pure): a stable code per cupper in that session ("C01", "C02"…
  in a deterministic order that does not reveal identity: order by the participant row's
  creation, not by name), present as a column in the existing owner CSV (names + code), and a
  second variant with the code and NO name, no id, no email (`?names=0` on the same route;
  owner / super-admin only as today; filename says "sin-nombres"). Tests: the no-names variant
  contains no display name, id or email of any cupper; codes are stable between the two
  variants for the same session; excluded cuppers are marked as today.
- UI: next to the existing CSV download on the owner's results page, a second link "CSV sin
  nombres" (`ReportLink`, the platform seam).
- Do NOT rename the score columns (another package does that).

## 3. D7 / F-grupos-10 — group members never see an email, not even masked
`app/[locale]/app/groups/[id]/page.tsx` (~l.220-223): the member view shows the display name,
else `maskEmail(m.email)`. Decision: every member sees NAMES; nobody but the group's OWNER sees
an email in any form.
- Member view (viewer is not the group owner): a member with a display name shows the name; a
  member with no name yet (invited by email, never signed in) shows es "Invitación pendiente"
  (+ en), with no address, no masked address, no initial. The server must not SEND the email
  (masked or not) in the member's payload: gate in the query/mapper, not in JSX; add a pure
  mapper + test ("member payload carries no email field or substring of any address").
- Owner view: unchanged (the owner typed those addresses).
- Check the other places a group member can see another member's address: the group feed
  (author names), group session invites, `CoCupperCard` (names only), any "leave group" or
  roster dialog, the groups list. Report each as leak / no leak with file:line and fix leaks.
- The owner's name and the list of group sessions stay visible to members (decided: names are
  fine).
- `docs/flows.md` group section and CLAUDE.md ("linked members' emails render masked" becomes
  "render only for the group owner").

## 4. F-cafes-9 — origin data edited after the fact is labelled "editado"
Confirmed behaviour (answer D1): a coffee's origin data is live; past sessions and reports
read the current values. The finding is closed by making that VISIBLE wherever those values
are shown for a past session, plus the stale-save check if it is still missing.
- Find every surface that shows origin / extrinsic data of a sample or coffee for a CLOSED
  session: results drill-down, the CVA PDF (`lib/pdf/cvaFormData.ts` → document), the print
  page, the coffee ficha PDF and the coffee profile's session list, the session ficha técnica.
  Where the data was edited after the session closed (`extrinsic_data.edited_at` after the
  session's `closedAt`; for the linked coffee, its `updatedAt` after `closedAt`), show a small
  note, es "Datos de origen editados el {fecha}" (+ en), same wording everywhere (one message
  key + the PDF text map). The results drill-down may already say "Origen editado el…": reuse
  that key; add the note where it is missing; list each surface in your report (had it / added).
- Coffee edit page copy `coffee.editSubtitle` ("Los cambios se reflejan en todas sus
  sesiones"): keep it true and complete, es: "Los cambios se reflejan en todas sus sesiones,
  también en las ya cerradas, con la nota «editado»." (+ en).
- `updateCoffee` stale-save check: the finding says a two-device edit silently loses a change.
  Check whether an `updatedAt` precondition already exists (the finding was "partly fixed in
  S8-10"). If missing: the form posts the `updatedAt` it loaded; the action refuses a stale
  save with the existing `conflict` code and the form shows "Este café cambió en otro
  dispositivo. Recarga para ver la versión actual." (+ en) with a reload button; DB test.

## Docs
CLAUDE.md, `docs/flows.md` §1 / §6 / groups, as above.

## Gates and delivery
All five gates (`npx tsc --noEmit`, `npm test`, `npm run test:db`, `npm run lint` with exactly
the 4 known errors in `app/[locale]/dev/page.tsx` and `components/ui/IntensitySlider.tsx`,
`npm run build`). Run gates one at a time; a unit-test timeout under load is not a failure if
the file passes when run alone (say so). Report: branch, PR number, commits; the reasons list
and how old stored values render; where the private notice is built and the proof that no
other cupper's exclusion reaches a participant; the CSV variants (headers of both); the group
leak table; the "editado" surface table; whether the stale-save check existed; every string
added or changed (es and en); gate tails with exact counts; anything not done or doubtful;
what can only be judged signed in or on a phone.
