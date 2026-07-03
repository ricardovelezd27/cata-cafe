# Edit Sample Metadata — Design

## Problem

A session's master (host) often opens a session quickly during a live cupping
("muestra A, B, C, rápido"), entering only a sample label and minimal or no
coffee data, intending to fill in origin/process/variety/farm etc. afterward.
Today there is no way to do that — `Coffee` fields are only ever set once, at
session creation, in `NewSessionForm`. There is no edit path anywhere in the
app for this data, including after tasting has started or the session has
closed.

This is distinct from "Editar evaluación" (editing a cupper's own score),
which already exists and is untouched by this change.

## Scope

Add a master-only "Editar muestra" entry point that edits:

- The sample's `Coffee` identity fields: `name`, `country`, `region`, `farm`
  (`producer`... see note below), `variety`, `processType`, `altitude`,
  `roastLevel`, `certifications`
- The sample's own `label` (`SessionSample.label`)

Available **at any time** after session creation — draft, active/in-progress,
or closed — not gated by session status or by whether the sample has been
revealed.

**Out of scope:** `PhysicalEvaluation` and `ExtrinsicData` are not part of
this feature. Both are already editable at any time via the "physical" and
"extrinsic" tabs in `CupClient` (see `CupClient.tsx` `CuppingTab` type and
`activeTab` handling) — they are not the gap Kim hit. Scores
(`Evaluation`, `AggregateScore`) are never touched by this feature.

## Data model

No schema changes. This writes to existing `Coffee` and `SessionSample`
columns only.

Note on `Coffee.producer` vs "farm": the schema's `Coffee` model already has
both `producer` and `farm`-equivalent fields as used by `NewSessionForm`'s
`CoffeeInput` type — the edit form mirrors exactly the field set already
collected at creation time, so no new fields are introduced.

`SessionSample.coffeeId` is nullable. Two cases on save:

- `coffeeId` present → `prisma.coffee.update({ where: { id: coffeeId }, data })`
- `coffeeId` null (sample created label-only) → create a new `Coffee` row
  (`createdBy: user.id`, `isPublic: false`, same defaults as
  `createCoffees()` in `sessions.ts`) and set it on the sample

### Shared-coffee caveat

`Coffee` rows are normally private to the session that created them (every
`createSession`/`createGroupSession` call creates fresh `Coffee` rows). They
can become shared across sessions only when a master deliberately links a
sample to a pre-existing coffee via `revealSample(sampleId, coffeeId)`. In
that case, editing the coffee's metadata here updates the shared record
globally — visible in the coffee list, `UserCoffeeHistory`, and any other
session referencing it. This is accepted as intentional: if a master
explicitly identified a sample as "the same coffee as before," a correction
to that coffee's data is expected to propagate to that identity everywhere it
appears. No override/snapshot layer is being added for this edge case.

## Server action

New function in `app/actions/sessions.ts`, alongside `upsertExtrinsic` /
`upsertPhysical`:

```ts
export async function updateSampleMetadata(
  sampleId: string,
  input: {
    label?: string;
    coffee: {
      name: string;
      producer?: string;
      variety?: string;
      altitude?: string;
      roastLevel?: string;
      country?: string;
      region?: string;
      processType?: string;
      certifications?: string;
    };
  }
) {
  const user = await requireUser();

  const sample = await prisma.sessionSample.findUnique({
    where: { id: sampleId },
    select: { id: true, sessionId: true, coffeeId: true, session: { select: { createdBy: true, id: true } } },
  });
  if (!sample) throw new Error("not_found");
  if (sample.session.createdBy !== user.id) throw new Error("forbidden");

  const coffeeData = { ...input.coffee, name: input.coffee.name || "Sin nombre" };

  if (sample.coffeeId) {
    await prisma.coffee.update({ where: { id: sample.coffeeId }, data: coffeeData });
  } else {
    const coffee = await prisma.coffee.create({
      data: { ...coffeeData, createdBy: user.id, isPublic: false },
      select: { id: true },
    });
    await prisma.sessionSample.update({
      where: { id: sampleId },
      data: { coffeeId: coffee.id },
    });
  }

  if (input.label !== undefined) {
    await prisma.sessionSample.update({
      where: { id: sampleId },
      data: { label: input.label || undefined },
    });
  }

  revalidatePath(`/app/sessions/${sample.sessionId}/cup`);
  revalidatePath(`/app/sessions/${sample.sessionId}/results`);
  revalidatePath(`/app/sessions/${sample.sessionId}/print`);

  return { ok: true };
}
```

Auth pattern matches `revealSample` exactly (`session.createdBy !== user.id`
→ throw). This also fixes, for this action only, the existing gap where
`upsertExtrinsic`/`upsertPhysical` don't call `revalidatePath` — those two
are left as-is (out of scope) but this new action does invalidate the
relevant routes so edits show up on next navigation without a manual
`router.refresh()`.

## UI

**New component:** `components/cupping/EditSampleMetadataForm.tsx` — a small
controlled form with the same fields as `NewSessionForm`'s per-coffee inputs
(name, country, region, farm/producer, variety, process, altitude, roast
level, certifications) plus a label input. Pure form component, receives
`initialData` + `onSubmit`, no data fetching of its own — consistent with
the "Form State Pattern" convention (state lifted, controlled by parent).

**Entry point 1 — Cup view (`CupClient.tsx`):**
- "Editar muestra" button near the sample tabs/header, rendered only when
  `isOwner` is true
- Opens a `ResponsiveDialog` containing `EditSampleMetadataForm`, pre-filled
  from the current sample's coffee data (fetched once when the dialog opens,
  or passed down if already available in the `session.samples` prop —
  requires extending the `Sample` type/query to include the coffee's current
  field values, not just `coffeeId`)
- On submit: call `updateSampleMetadata`, then patch the local
  `session.samples` state in `CupClient` so the UI reflects the change
  immediately without a full reload (matching the existing auto-save UX)

**Entry point 2 — Results view (`ResultsClient.tsx`):**
- Same "Editar muestra" button per sample card, gated on `isOwner`, next to
  the existing "← Editar evaluación" control
- Same dialog/form, same server action
- After save, rely on `revalidatePath` + `router.refresh()` (results view is
  server-rendered per sample list, no local optimistic patch needed the way
  `CupClient` does)

**Print/export (`app/[locale]/app/sessions/[id]/print/page.tsx`):** no code
changes — it's a fresh server render reading `coffee.name` etc. from the DB,
so it automatically reflects edits once `revalidatePath` has run.

## Access control / blind-tasting

- Both entry points are gated on `isOwner` (`session.createdBy === user.id`),
  the same check already used for `MasterControls` and `revealSample`.
  Non-master participants never see the "Editar muestra" button.
- No new leakage: this feature doesn't change what's already shown to
  pre-reveal participants. The edit action itself doesn't touch `revealed`.
- The server action independently re-verifies ownership (never trust the
  client-side `isOwner` gate alone).

## Error handling

- Non-master calling the action → thrown error, caught by the client and
  surfaced as a toast/inline error in the dialog (dialog stays open, no
  silent failure)
- `sampleId` not found / doesn't belong to the caller's session → `not_found`
- Empty coffee name → defaults to `"Sin nombre"` server-side (matches
  `createCoffees()` behavior at session creation), not a hard validation
  error
- Network/offline: this feature is master-only, synchronous, dialog-based —
  it does not go through the offline draft-store path (`lib/offline/store.ts`)
  that cupper evaluations use. If the master is offline, the dialog's submit
  simply fails and shows an error; no offline queueing is added for this
  action (out of scope — this is an infrequent metadata correction, not a
  per-keystroke evaluation save)

## Testing / verification

Manual verification (no automated test suite currently exercises server
actions in this codebase):

1. As master, mid-tasting (session status active, before any reveal): open
   "Editar muestra" from the cup view, change origin/variety/farm, save →
   confirm it persists and shows immediately in the cup view without reload
2. Reload as a **non-master participant** in the same session → confirm no
   "Editar muestra" button appears anywhere
3. Submit scores as a participant, then have the master edit sample metadata
   afterward → confirm the participant's `Evaluation` and the sample's
   `AggregateScore` are unchanged
4. View results and print/export after the edit → confirm both reflect the
   corrected metadata
5. Edit a sample that has `coffeeId: null` (created label-only) → confirm a
   new `Coffee` row is created and linked, not an error
6. Edit a sample whose coffee was linked to an existing coffee via
   `revealSample` → confirm the change is visible on the coffee list page
   and in `UserCoffeeHistory` for other sessions referencing that coffee
   (expected/accepted behavior, not a bug)
7. Attempt to call `updateSampleMetadata` as a non-master (e.g. via devtools)
   → confirm server-side rejection, not just client-side button hiding
