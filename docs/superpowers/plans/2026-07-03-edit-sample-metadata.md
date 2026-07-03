# Edit Sample Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a session's master edit a sample's coffee-identity metadata (name, origin, farm, process, variety, altitude, roast level) and its label at any time after session creation, via a new "Editar muestra" entry point in both the cup view and results view — separate from "Editar evaluación."

**Architecture:** One new server action (`updateSampleMetadata` in `app/actions/sessions.ts`) writes directly to the sample's `Coffee` row (or creates one if the sample has none) plus `SessionSample.label`. One new shared form component (`EditSampleMetadataForm`) renders inside the existing `ResponsiveDialog`. Two call sites — `CupClient` and `ResultsClient` — each get their own dialog-open state and their own "Editar muestra" trigger(s), both gated on `isOwner`.

**Tech Stack:** Next.js 16 server actions, Prisma (generated client at `app/generated/prisma`), React 19 client components, next-intl for translations, Tailwind CSS 4, Radix Dialog via the existing `ResponsiveDialog` wrapper.

## Global Constraints

- Prisma client imports from `@/app/generated/prisma` — never `@prisma/client` directly (not needed in this plan; all DB access goes through the existing `prisma` singleton from `lib/prisma.ts`).
- Master/owner check is always `session.createdBy === user.id`, re-verified server-side in every new action — never trust a client-side `isOwner` prop alone.
- This codebase has **no automated test runner** (`package.json` has no `test` script, no jest/vitest). The one precedent for verifying logic (`scripts/verify-group-average.ts`) only covers pure functions in `lib/scoring.ts`, not server actions or DB writes. Per "follow existing patterns," this plan does **not** invent a new test framework. Each task's verification step is `npx tsc --noEmit` (typecheck) plus, where a UI path exists, manual verification through the running dev server (browser). The final task is a full manual regression pass.
- Editing sample metadata must never touch `Evaluation` or `AggregateScore` rows.
- The `SessionSample.revealed` gate (blind tasting) must not be affected: the participant-facing `coffee` field in the results query stays exactly as gated today (`s.revealed && s.coffee ? s.coffee : null`); the new master-only field is additive, not a replacement.
- Coffee identity fields being edited (schema `Coffee` model, `prisma/schema.prisma:33-58`): `name`, `country`, `region`, `farm`, `producer`, `variety`, `processType`, `altitude`, `roastLevel`. `species`, `harvestYear`, `certifications` (`String[]`), and `notes` are out of scope (no existing UI pattern for them, not part of Kim's complaint) — do not add them.

---

### Task 1: Server action `updateSampleMetadata`

**Files:**
- Modify: `app/actions/sessions.ts`

**Interfaces:**
- Produces: `updateSampleMetadata(sampleId: string, input: SampleMetadataInput): Promise<{ ok: true }>` where
  ```ts
  type SampleMetadataInput = {
    label: string;
    name: string;
    country: string;
    region: string;
    farm: string;
    producer: string;
    variety: string;
    processType: string;
    altitude: string;
    roastLevel: string;
  };
  ```
  Throws `Error("not_found")` if the sample doesn't exist, `Error("forbidden")` if the caller isn't the session's creator.

- [ ] **Step 1: Add the `SampleMetadataInput` type and `updateSampleMetadata` function**

Add this to `app/actions/sessions.ts`, after the existing `upsertPhysical` function (which ends around line 224) and before `upsertExtrinsic`:

```ts
export type SampleMetadataInput = {
  label: string;
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  processType: string;
  altitude: string;
  roastLevel: string;
};

export async function updateSampleMetadata(
  sampleId: string,
  input: SampleMetadataInput
) {
  const user = await requireUser();

  const sample = await prisma.sessionSample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      sessionId: true,
      coffeeId: true,
      session: { select: { createdBy: true } },
    },
  });
  if (!sample) throw new Error("not_found");
  if (sample.session.createdBy !== user.id) throw new Error("forbidden");

  const coffeeData = {
    name: input.name || "Sin nombre",
    country: input.country || null,
    region: input.region || null,
    farm: input.farm || null,
    producer: input.producer || null,
    variety: input.variety || null,
    processType: input.processType || null,
    altitude: input.altitude || null,
    roastLevel: input.roastLevel || null,
  };

  if (sample.coffeeId) {
    await prisma.coffee.update({
      where: { id: sample.coffeeId },
      data: coffeeData,
    });
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

  await prisma.sessionSample.update({
    where: { id: sampleId },
    data: { label: input.label || undefined },
  });

  revalidatePath(`/app/sessions/${sample.sessionId}/cup`);
  revalidatePath(`/app/sessions/${sample.sessionId}/results`);
  revalidatePath(`/app/sessions/${sample.sessionId}/print`);

  return { ok: true as const };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (this function has no callers yet, so it only needs to compile standalone against the Prisma types).

- [ ] **Step 3: Commit**

```bash
git add app/actions/sessions.ts
git commit -m "feat: add updateSampleMetadata server action for master sample edits"
```

---

### Task 2: `EditSampleMetadataForm` component + translation key

**Files:**
- Create: `components/cupping/EditSampleMetadataForm.tsx`
- Modify: `messages/es.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: nothing new (pure controlled form).
- Produces:
  ```ts
  export type SampleCoffeeFields = {
    name: string;
    country: string;
    region: string;
    farm: string;
    producer: string;
    variety: string;
    processType: string;
    altitude: string;
    roastLevel: string;
  };
  export type SampleMetadataFormData = SampleCoffeeFields & { label: string };
  export type EditSampleMetadataFormTranslations = {
    label: string; name: string; country: string; region: string; farm: string;
    producer: string; variety: string; process: string; altitude: string;
    roastLevel: string; save: string; saving: string; cancel: string;
  };
  ```
  `EditSampleMetadataForm(props: { initialData: SampleMetadataFormData; onSubmit: (data: SampleMetadataFormData) => Promise<void>; onCancel: () => void; translations: EditSampleMetadataFormTranslations })` — used by both `CupClient` and `ResultsClient` in later tasks.

- [ ] **Step 1: Add the `editSample` translation key**

In `messages/es.json`, inside the `"session"` object (starts at line 79), add after `"sampleCoffee": "Café correspondiente",` (line 94):

```json
    "sampleCoffee": "Café correspondiente",
    "editSample": "Editar muestra",
```

In `messages/en.json`, inside the `"session"` object (starts at line 79), add after `"sampleCoffee": "Corresponding coffee",` (line 94):

```json
    "sampleCoffee": "Corresponding coffee",
    "editSample": "Edit sample",
```

- [ ] **Step 2: Create the form component**

Create `components/cupping/EditSampleMetadataForm.tsx`:

```tsx
"use client";

import { useState } from "react";

export type SampleCoffeeFields = {
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  processType: string;
  altitude: string;
  roastLevel: string;
};

export type SampleMetadataFormData = SampleCoffeeFields & { label: string };

export type EditSampleMetadataFormTranslations = {
  label: string;
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  process: string;
  altitude: string;
  roastLevel: string;
  save: string;
  saving: string;
  cancel: string;
};

const inputCls =
  "w-full px-3 py-2 border border-[#D4C5A9] rounded-lg text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark";
const labelCls =
  "block text-xs text-brown-mid font-semibold uppercase tracking-wide mb-1";

export function EditSampleMetadataForm({
  initialData,
  onSubmit,
  onCancel,
  translations: t,
}: {
  initialData: SampleMetadataFormData;
  onSubmit: (data: SampleMetadataFormData) => Promise<void>;
  onCancel: () => void;
  translations: EditSampleMetadataFormTranslations;
}) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);

  const set = (field: keyof SampleMetadataFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(data);
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: keyof SampleMetadataFormData; label: string }[] = [
    { key: "label", label: t.label },
    { key: "name", label: t.name },
    { key: "country", label: t.country },
    { key: "region", label: t.region },
    { key: "farm", label: t.farm },
    { key: "producer", label: t.producer },
    { key: "variety", label: t.variety },
    { key: "processType", label: t.process },
    { key: "altitude", label: t.altitude },
    { key: "roastLevel", label: t.roastLevel },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ key, label }) => (
          <div key={key} className={key === "name" || key === "label" ? "col-span-2" : undefined}>
            <label className={labelCls}>{label}</label>
            <input
              className={inputCls}
              value={data[key]}
              onChange={set(key)}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="px-4 py-2 rounded-md border border-brown-light font-sans text-sm text-brown-dark hover:bg-cream disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t.cancel}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-md bg-green-dark font-sans text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {saving ? t.saving : t.save}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/cupping/EditSampleMetadataForm.tsx messages/es.json messages/en.json
git commit -m "feat: add EditSampleMetadataForm component and editSample translation key"
```

---

### Task 3: Wire "Editar muestra" into the cup view (`CupClient`)

**Files:**
- Modify: `app/[locale]/app/sessions/[id]/cup/page.tsx`
- Modify: `app/[locale]/app/sessions/[id]/cup/CupClient.tsx`

**Interfaces:**
- Consumes: `updateSampleMetadata` (Task 1), `EditSampleMetadataForm` + `SampleCoffeeFields` + `SampleMetadataFormData` (Task 2), `ResponsiveDialog` (`components/ui/ResponsiveDialog.tsx`, already exists).
- Produces: `Sample.coffee: SampleCoffeeFields | null` field on `CupClient`'s `Sample` type, populated only when `isOwner` (server-gated, not just UI-gated).

- [ ] **Step 1: Add the `coffee` relation to the Prisma query and gate it on `isOwner`**

In `app/[locale]/app/sessions/[id]/cup/page.tsx`, the query's `samples.include` currently reads (lines 33-41):

```ts
      samples: {
        orderBy: { position: "asc" },
        include: {
          evaluations: { where: { cupperId: user.id } },
          physical: true,
          extrinsic: true,
          aggregateScore: true,
        },
      },
```

Change it to also fetch `coffee`:

```ts
      samples: {
        orderBy: { position: "asc" },
        include: {
          evaluations: { where: { cupperId: user.id } },
          physical: true,
          extrinsic: true,
          aggregateScore: true,
          coffee: {
            select: {
              name: true,
              country: true,
              region: true,
              farm: true,
              producer: true,
              variety: true,
              processType: true,
              altitude: true,
              roastLevel: true,
            },
          },
        },
      },
```

Then, in the `session.samples.map((s) => {...})` block (lines 97-113), add a `coffee` field to the returned object, gated on `isOwner` so non-owners never receive it in the page payload:

```ts
        samples: session.samples.map((s) => {
          const ev = s.evaluations[0];
          return {
            id: s.id,
            label: s.label,
            position: s.position,
            isDraft: ev?.isDraft ?? true,
            evaluationId: ev?.id ?? null,
            descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
            affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
            combined: (ev?.combinedData as Record<string, unknown>) ?? {},
            physical: (s.physical?.data as Record<string, unknown>) ?? {},
            extrinsic: (s.extrinsic?.data as Record<string, unknown>) ?? {},
            revealed: s.revealed,
            coffeeId: s.coffeeId,
            coffee: isOwner
              ? {
                  name: s.coffee?.name ?? "",
                  country: s.coffee?.country ?? "",
                  region: s.coffee?.region ?? "",
                  farm: s.coffee?.farm ?? "",
                  producer: s.coffee?.producer ?? "",
                  variety: s.coffee?.variety ?? "",
                  processType: s.coffee?.processType ?? "",
                  altitude: s.coffee?.altitude ?? "",
                  roastLevel: s.coffee?.roastLevel ?? "",
                }
              : null,
          };
        }),
```

Also add the `editSample` translation to the `translations` object passed to `<CupClient>` (after `process: t("actions.process"),` around line 126):

```ts
        process: t("actions.process"),
        editSample: t("session.editSample"),
```

- [ ] **Step 2: Typecheck (expected to fail — `CupClient` doesn't accept these props yet)**

Run: `npx tsc --noEmit`
Expected: FAIL — `Type '{ ...; coffee: ...; }' is not assignable to type 'Sample'` and `Property 'editSample' does not exist on type '{...}'` (from `CupClient`'s prop types). This confirms the page is now sending data `CupClient` doesn't yet consume — fixed in the next step.

- [ ] **Step 3: Extend `CupClient`'s types, state, and save handler**

In `app/[locale]/app/sessions/[id]/cup/CupClient.tsx`:

Add the import (near the other action imports, line 12-16):

```ts
import {
  upsertEvaluation,
  upsertExtrinsic,
  upsertPhysical,
  updateSampleMetadata,
} from "@/app/actions/sessions";
import {
  EditSampleMetadataForm,
  type SampleMetadataFormData,
} from "@/components/cupping/EditSampleMetadataForm";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
```

Extend the `Sample` type (lines 62-75) to add `coffee`:

```ts
type SampleCoffee = {
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  processType: string;
  altitude: string;
  roastLevel: string;
};

type Sample = {
  id: string;
  label: string;
  position: number;
  isDraft: boolean;
  evaluationId: string | null;
  descriptive: Data;
  affective: Data;
  combined: Data;
  physical: Data;
  extrinsic: Data;
  revealed: boolean;
  coffeeId: string | null;
  coffee: SampleCoffee | null;
};
```

Add `editSample: string;` to the `translations` prop type (after `process: string;` around line 122):

```ts
    process: string;
    editSample: string;
```

Add dialog state, right after `const [saveStatus, ...]` (around line 169-171):

```ts
  const [editingSample, setEditingSample] = useState(false);
```

Add a save handler near `flushSave`/`persist` (after the `persist` function, around line 385):

```ts
  const handleSaveSampleMetadata = async (data: SampleMetadataFormData) => {
    await updateSampleMetadata(current.id, data);
    setSamples((prev) =>
      prev.map((s) =>
        s.id === current.id
          ? { ...s, label: data.label, coffee: { ...data } }
          : s
      )
    );
    setEditingSample(false);
  };
```

(`current` is defined later in the file at line 512 as `const current = samples[sampleIdx];` — since this is a plain function, not called until render time, referencing `current` here is fine because by the time `handleSaveSampleMetadata` actually runs, `current` has been assigned earlier in the same render pass. If your editor's linter complains about use-before-definition, move this handler to directly after the `const current = samples[sampleIdx];` line instead.)

- [ ] **Step 4: Add the "Editar muestra" button**

Define the button once, right after `const current = samples[sampleIdx];` (line 512), alongside the other JSX-building `const`s already in that area of the file:

```ts
  const editSampleButton = isOwner ? (
    <button
      type="button"
      onClick={() => setEditingSample(true)}
      className="shrink-0 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-brown-mid hover:text-green-dark"
    >
      ✎ {translations.editSample}
    </button>
  ) : null;
```

Wire it into three spots:

1. **Mobile/tablet sample bar** — this single change covers both the "cupping" tab and the physical/extrinsic tabs, since `mobileSampleBar` is reused in both branches. Change (lines 642-649):

```tsx
  const mobileSampleBar = (
    <div className="lg:hidden flex items-center gap-3 px-4 py-1.5 border-t border-brown-light bg-bg">
      <div className="min-w-0 flex-1">{sampleTabsBar}</div>
      <span className="shrink-0 font-mono text-[10px] text-brown-mid tabular-nums">
        {sampleIdx + 1}/{samples.length}
      </span>
      {editSampleButton}
    </div>
  );
```

2. **Desktop, "cupping" tab** — in the `topBar` block, the sample-tabs row (lines 718-720):

```tsx
            <div className="border-t border-brown-light pt-1.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">{sampleTabsBar}</div>
              {editSampleButton}
            </div>
```

3. **Desktop, "physical"/"extrinsic" tabs** — the sample-label row (lines 753-763):

```tsx
        <div className="flex items-center gap-3 px-6 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brown-mid">
            {activeTab === "physical"
              ? translations.physical
              : translations.extrinsic}
          </span>
          <span className="text-brown-light">·</span>
          <span className="font-display text-base text-brown-dark">
            {translations.sample} {current.label}
          </span>
          <div className="flex-1" />
          {editSampleButton}
        </div>
```

- [ ] **Step 5: Render the dialog**

Right after the `<OfflineBanner .../>` element inside the `<SessionShell>` children (around line 794-799), add:

```tsx
      {isOwner && editingSample && (
        <ResponsiveDialog
          open={editingSample}
          onOpenChange={setEditingSample}
          title={`${translations.editSample}: ${current.label}`}
        >
          <EditSampleMetadataForm
            initialData={{
              label: current.label,
              name: current.coffee?.name ?? "",
              country: current.coffee?.country ?? "",
              region: current.coffee?.region ?? "",
              farm: current.coffee?.farm ?? "",
              producer: current.coffee?.producer ?? "",
              variety: current.coffee?.variety ?? "",
              processType: current.coffee?.processType ?? "",
              altitude: current.coffee?.altitude ?? "",
              roastLevel: current.coffee?.roastLevel ?? "",
            }}
            onSubmit={handleSaveSampleMetadata}
            onCancel={() => setEditingSample(false)}
            translations={{
              label: translations.sample,
              name: translations.coffeeName,
              country: translations.coffeeCountry,
              region: translations.coffeeRegion,
              farm: translations.coffeeFarm,
              producer: translations.producerRoaster,
              variety: translations.coffeeVariety,
              process: translations.coffeeProcess,
              altitude: translations.coffeeAltitude,
              roastLevel: translations.coffeeRoastLevel,
              save: translations.save,
              saving: translations.saving,
              cancel: translations.cancel,
            }}
          />
        </ResponsiveDialog>
      )}
```

This references several translation keys (`coffeeName`, `coffeeCountry`, `coffeeRegion`, `coffeeFarm`, `producerRoaster`, `coffeeVariety`, `coffeeProcess`, `coffeeAltitude`, `coffeeRoastLevel`, `save`, `saving`, `cancel`) that don't exist yet on `CupClient`'s `translations` prop. Add them to the type (next to `editSample: string;`) and pass them from `cup/page.tsx`:

In `CupClient.tsx`'s `translations` prop type, add:

```ts
    editSample: string;
    coffeeName: string;
    coffeeCountry: string;
    coffeeRegion: string;
    coffeeFarm: string;
    producerRoaster: string;
    coffeeVariety: string;
    coffeeProcess: string;
    coffeeAltitude: string;
    coffeeRoastLevel: string;
    save: string;
    saving: string;
    cancel: string;
```

In `app/[locale]/app/sessions/[id]/cup/page.tsx`, add a `tc = await getTranslations("coffee")` and `ta = await getTranslations("actions")` call (next to the existing `t`/`tg` calls around line 76-77):

```ts
  const t = await getTranslations();
  const tg = await getTranslations("group");
  const tc = await getTranslations("coffee");
  const ta = await getTranslations("actions");
```

And extend the `translations={{ ... }}` object passed to `<CupClient>` (after `process: t("actions.process"),` / `editSample: t("session.editSample"),` added in Step 1):

```ts
        editSample: t("session.editSample"),
        coffeeName: t("session.coffeeName"),
        coffeeCountry: tc("country"),
        coffeeRegion: tc("region"),
        coffeeFarm: tc("farm"),
        producerRoaster: t("session.producerRoaster"),
        coffeeVariety: tc("variety"),
        coffeeProcess: tc("process"),
        coffeeAltitude: tc("altitude"),
        coffeeRoastLevel: tc("roastLevel"),
        save: ta("save"),
        saving: ta("saving"),
        cancel: ta("cancel"),
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 7: Manual verification — dev server**

Start the dev server (`npm run dev` or via the project's preview tooling) and, as the session's master:

1. Open a session's cup view. Confirm an "✎ Editar muestra" control is visible near the sample tabs (both on the cupping tab and on the physical/extrinsic tabs, desktop and mobile widths).
2. Click it, edit the coffee name/origin/farm/process fields, save. Confirm the dialog closes and — without a page reload — the sample's data reflects the edit (e.g., reopen the dialog and see the new values pre-filled).
3. Log in as a non-master participant in the same session (or check via the dev role switcher if available) and confirm no "Editar muestra" control renders anywhere.

Expected: all three checks pass.

- [ ] **Step 8: Commit**

```bash
git add app/[locale]/app/sessions/[id]/cup/page.tsx "app/[locale]/app/sessions/[id]/cup/CupClient.tsx"
git commit -m "feat: add Editar muestra entry point to the cup view"
```

---

### Task 4: Wire "Editar muestra" into the results view (`ResultsClient`)

**Files:**
- Modify: `app/[locale]/app/sessions/[id]/results/page.tsx`
- Modify: `app/[locale]/app/sessions/[id]/results/ResultsClient.tsx`

**Interfaces:**
- Consumes: `updateSampleMetadata` (Task 1), `EditSampleMetadataForm` + types (Task 2), `ResponsiveDialog`.
- Produces: `SampleResult.masterCoffee: SampleCoffeeFields | null` — populated only when `isOwner`, independent of `revealed` (unlike the existing `coffee` field, which stays reveal-gated for participant-facing views).

- [ ] **Step 1: Expand the Prisma `coffee` select and add `masterCoffee` to the response**

In `app/[locale]/app/sessions/[id]/results/page.tsx`, the `coffee: { select: {...} }` block (lines 40-50) currently selects `name, country, region, producer, variety, altitude, roastLevel`. Add `farm` and `processType`:

```ts
            coffee: {
              select: {
                name: true,
                country: true,
                region: true,
                producer: true,
                variety: true,
                altitude: true,
                roastLevel: true,
                farm: true,
                processType: true,
              },
            },
```

Then, in the `session.samples.map((s) => {...})` block that builds the response passed to `<ResultsClient>` (lines 308-360), add a `masterCoffee` field alongside the existing `coffee` field (around line 352):

```ts
          return {
            id: s.id,
            label: s.label,
            revealed: s.revealed,
            coffee: s.revealed && s.coffee ? s.coffee : null,
            masterCoffee: isOwner
              ? {
                  name: s.coffee?.name ?? "",
                  country: s.coffee?.country ?? "",
                  region: s.coffee?.region ?? "",
                  farm: s.coffee?.farm ?? "",
                  producer: s.coffee?.producer ?? "",
                  variety: s.coffee?.variety ?? "",
                  processType: s.coffee?.processType ?? "",
                  altitude: s.coffee?.altitude ?? "",
                  roastLevel: s.coffee?.roastLevel ?? "",
                }
              : null,
            descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
            affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
            combined: (ev?.combinedData as Record<string, unknown>) ?? {},
            physical: (s.physical?.data as Record<string, unknown>) ?? {},
            extrinsic: (s.extrinsic?.data as Record<string, unknown>) ?? {},
            aggregateScore,
          };
```

Add the `editSample` translation to the `translations={{ ... }}` block passed to `<ResultsClient>` (after `descEmptyAll: tDesc("emptyAll"),` around line 377):

```ts
        descEmptyAll: tDesc("emptyAll"),
        editSample: t("session.editSample"),
```

This needs a `t = await getTranslations("session")` call added next to the existing `tCommunity`/`tg`/`tAttr`/`tDesc`/`tOffline` calls (around line 259-263):

```ts
  const tCommunity = await getTranslations("community");
  const tg = await getTranslations("group");
  const tAttr = await getTranslations("attributes");
  const tDesc = await getTranslations("descriptors");
  const tOffline = await getTranslations("offline");
  const t = await getTranslations("session");
  const tc = await getTranslations("coffee");
  const ta = await getTranslations("actions");
```

And add the remaining field-label translations the form needs, same block as `editSample` above:

```ts
        editSample: t("editSample"),
        coffeeName: t("coffeeName"),
        coffeeCountry: tc("country"),
        coffeeRegion: tc("region"),
        coffeeFarm: tc("farm"),
        producerRoaster: t("producerRoaster"),
        coffeeVariety: tc("variety"),
        coffeeProcess: tc("process"),
        coffeeAltitude: tc("altitude"),
        coffeeRoastLevel: tc("roastLevel"),
        save: ta("save"),
        saving: ta("saving"),
        cancel: ta("cancel"),
```

(Note: `t` here is scoped to `"session"`, so it's `t("editSample")` not `t("session.editSample")` — different from Task 3's `cup/page.tsx`, which calls the unscoped `getTranslations()` and so needs the full `"session.editSample"` path. Keep each file's existing convention.)

- [ ] **Step 2: Typecheck (expected to fail — `ResultsClient` doesn't accept these props yet)**

Run: `npx tsc --noEmit`
Expected: FAIL — type mismatch on `SampleResult`/`translations` passed to `ResultsClient`. Fixed next.

- [ ] **Step 3: Extend `ResultsClient`'s types, state, and add the sample-chips row + dialog**

In `app/[locale]/app/sessions/[id]/results/ResultsClient.tsx`:

Add imports (top of file, after the existing imports around line 17):

```ts
import {
  EditSampleMetadataForm,
  type SampleMetadataFormData,
} from "@/components/cupping/EditSampleMetadataForm";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { updateSampleMetadata } from "@/app/actions/sessions";
```

Add the `SampleCoffee` type and extend `SampleResult` (lines 32-53):

```ts
type SampleCoffee = {
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  processType: string;
  altitude: string;
  roastLevel: string;
};

type SampleResult = {
  id: string;
  label: string;
  revealed: boolean;
  coffee: CoffeeInfo | null;
  masterCoffee: SampleCoffee | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  physical: Record<string, unknown>;
  extrinsic: Record<string, unknown>;
  aggregateScore: AggregateScoreData | null;
};
```

Extend the `translations` prop type (lines 88-105), adding after `descEmptyAll: string;`:

```ts
    descEmptyAll: string;
    editSample: string;
    coffeeName: string;
    coffeeCountry: string;
    coffeeRegion: string;
    coffeeFarm: string;
    producerRoaster: string;
    coffeeVariety: string;
    coffeeProcess: string;
    coffeeAltitude: string;
    coffeeRoastLevel: string;
    save: string;
    saving: string;
    cancel: string;
```

Add dialog state, next to the other `useState` calls (around line 108-111):

```ts
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
```

Add the save handler, next to `handleReveal` (around line 117-122):

```ts
  const editingSample = session.samples.find((s) => s.id === editingSampleId) ?? null;

  const handleSaveSampleMetadata = async (data: SampleMetadataFormData) => {
    if (!editingSampleId) return;
    await updateSampleMetadata(editingSampleId, data);
    setEditingSampleId(null);
    router.refresh();
  };
```

Add a compact, master-only "edit sample" chip row right after the title row (after the closing `</div>` of the title row block, which ends at line 231, and before the "Mine / Group pills" block that starts at line 234):

```tsx
        {isOwner && (
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              padding: "0 16px 8px",
            }}
          >
            {session.samples.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setEditingSampleId(s.id)}
                style={{
                  flexShrink: 0,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  border: "1px solid #E8E0D0",
                  background: "transparent",
                  color: "#8B7355",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
              >
                ✎ {s.label}
              </button>
            ))}
          </div>
        )}
```

Add the dialog render right before the closing `</div>` of the component's root element (end of file, after the "Print CTA" footer block, around line 454-456):

```tsx
      {isOwner && editingSample && (
        <ResponsiveDialog
          open
          onOpenChange={() => setEditingSampleId(null)}
          title={`${translations.editSample}: ${editingSample.label}`}
        >
          <EditSampleMetadataForm
            initialData={{
              label: editingSample.label,
              name: editingSample.masterCoffee?.name ?? "",
              country: editingSample.masterCoffee?.country ?? "",
              region: editingSample.masterCoffee?.region ?? "",
              farm: editingSample.masterCoffee?.farm ?? "",
              producer: editingSample.masterCoffee?.producer ?? "",
              variety: editingSample.masterCoffee?.variety ?? "",
              processType: editingSample.masterCoffee?.processType ?? "",
              altitude: editingSample.masterCoffee?.altitude ?? "",
              roastLevel: editingSample.masterCoffee?.roastLevel ?? "",
            }}
            onSubmit={handleSaveSampleMetadata}
            onCancel={() => setEditingSampleId(null)}
            translations={{
              label: translations.sampleLabel,
              name: translations.coffeeName,
              country: translations.coffeeCountry,
              region: translations.coffeeRegion,
              farm: translations.coffeeFarm,
              producer: translations.producerRoaster,
              variety: translations.coffeeVariety,
              process: translations.coffeeProcess,
              altitude: translations.coffeeAltitude,
              roastLevel: translations.coffeeRoastLevel,
              save: translations.save,
              saving: translations.saving,
              cancel: translations.cancel,
            }}
          />
        </ResponsiveDialog>
      )}
    </div>
  );
}
```

The dialog code above references `translations.sampleLabel`, which doesn't exist on `ResultsClient`'s translations object yet — `session.sampleLabel` already exists as a message key (`"Etiqueta"` / `"Label"`, see `messages/es.json:99`) but nothing in `results/page.tsx` reads it today. Add it in `results/page.tsx`, alongside the other new keys added in Step 1:

```ts
        sampleLabel: t("sampleLabel"),
```

(`t` is the `"session"`-scoped translator added in Step 1.) And add `sampleLabel: string;` to `ResultsClient`'s translations prop type, next to `editSample: string;`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Manual verification — dev server**

As the session's master, open the results view:

1. Confirm a row of small "✎ [sample label]" chips appears below the header, one per sample.
2. Click one, edit fields, save. Confirm the dialog closes and the page refreshes with the new label/coffee data reflected (e.g., in the score table's sample column, and in `MyResultsSummary` if it displays labels).
3. Navigate to the print view (`/app/sessions/[id]/print`) and confirm the edited coffee name/origin appear there too.
4. As a non-master participant, confirm the chip row does not render.
5. Repeat step 2 for a sample that had `coffeeId: null` before the edit (a sample created without coffee data) — confirm it gets a new `Coffee` row created and linked (no error), and that submitted evaluations/scores for that sample are unaffected.

Expected: all checks pass.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/app/sessions/[id]/results/page.tsx" "app/[locale]/app/sessions/[id]/results/ResultsClient.tsx"
git commit -m "feat: add Editar muestra entry point to the results view"
```

---

### Task 5: Full manual regression pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full spec verification checklist**

Using the running dev server, as documented in the design spec (`docs/superpowers/specs/2026-07-03-edit-sample-metadata-design.md`, "Testing / verification" section), walk through all 7 scenarios end-to-end in a single session:

1. Mid-tasting (active session, before reveal), as master: edit a sample's origin/variety/farm from the cup view, confirm it persists and shows immediately without a manual reload.
2. As a non-master participant in the same session: confirm no "Editar muestra" control appears in either the cup view or the results view.
3. Submit scores as a participant, then edit sample metadata as master afterward: confirm the participant's evaluation and the sample's aggregate/community score are unchanged.
4. View results and the print/export page after the edit: confirm both reflect the corrected metadata.
5. Edit a sample that has no linked coffee (`coffeeId: null`): confirm a new `Coffee` row is created and linked, not an error.
6. If feasible in your test data: edit a sample whose coffee was linked to an existing coffee via `revealSample`, and confirm the change is visible on the `/app/coffees` list page and in that coffee's tasting history for other sessions referencing it (expected/accepted behavior per the spec, not a bug).
7. Attempt to call `updateSampleMetadata` as a non-master directly (e.g. via browser devtools console, calling the server action with another session's `sampleId`) — confirm a server-side rejection (`forbidden`), not just a hidden button.

- [ ] **Step 2: Run project-wide checks**

```bash
npx tsc --noEmit
npm run lint
```

Expected: both pass with no new errors introduced by this feature.

- [ ] **Step 3: Final commit (if any fixes were needed)**

If Step 1 or Step 2 surfaced issues, fix them and commit:

```bash
git add -A
git commit -m "fix: address issues found in edit-sample-metadata regression pass"
```

If no issues were found, no commit is needed for this task.
