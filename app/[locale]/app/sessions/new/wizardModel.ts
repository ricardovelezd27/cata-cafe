// The session wizard's form model, pure (S7a, finding D-05): the shapes of its
// coffee cards and sample rows, the operations of its ONE list of samples, and
// the builder of what it posts to createSession / createGroupSession.
//
// The state keeps the shape it always had (`coffees` + `samples`, the samples
// pointing at a card by id), so the localStorage draft (lib/wizardDraft.ts) and
// the server's input are unchanged. What changed is the screen: one list of
// samples, each showing its own coffee card, or "the same coffee as sample N".
// A card belongs on screen to the FIRST sample that points at it (its owner).
//
// tests/wizardPayload.test.ts keeps a frozen copy of the builder and of the old
// two-list operations as they were before S7a, and proves the payload is the
// same, field by field, for the same choices.
import type { UsableCoffee } from "@/components/coffees/CoffeePicker";
import { DEFAULT_REFERENCE_MODE, type ReferenceMode } from "@/lib/referenceRules";
import type { NotifyWhen } from "@/lib/groupNotify";
import type { WarmupId } from "@/lib/warmup/exercises";

// Same field set as the standalone CoffeeForm — wizard coffees land in the
// same coffees table with the same shape (no wizard-only subset).
export type CoffeeInput = {
  name: string;
  producer: string;
  variety: string;
  altitude: string;
  roastLevel: string;
  country: string;
  region: string;
  farm: string;
  species: string;
  harvestYear: string;
  processType: string;
  certifications: string[];
  notes: string;
};

export type CoffeeEntry = CoffeeInput & {
  id: string;
  existingCoffeeId?: string;
  /** Origin badge of the linked coffee — display-only, never submitted. */
  linkedOrigin?: UsableCoffee["origin"];
};

export type SampleEntry = {
  id: string;
  label: string;
  coffeeId: string;
  /** True while the label is still empty = a random letter is drawn at creation (A4). */
  auto: boolean;
  /** A9 optional prep data (owner-only until the sample is revealed). */
  roastDate?: string;
  preparationNote?: string;
  offProtocol?: boolean;
  offProtocolNote?: string;
};

export type SessionFormat = "descriptive" | "affective" | "combined";

/** Stable id for coffees/samples so React keys and card refs survive add/remove. */
export const newId = () => crypto.randomUUID();

/** The blank coffee card. Every new card is a spread of THIS object, so the
 *  cards share one `certifications` array until a chip is pressed; the server
 *  action's encoder writes a shared array once and refers to it after, which
 *  is part of the exact payload the wizard has always sent. */
export const EMPTY_COFFEE: CoffeeInput = {
  name: "",
  producer: "",
  variety: "",
  altitude: "",
  roastLevel: "",
  country: "",
  region: "",
  farm: "",
  species: "",
  harvestYear: "",
  processType: "",
  certifications: [],
  notes: "",
};

/** A fresh, blank coffee card. The rows of the FIRST render pass a fixed id
 *  (the server and the browser must render the same `id` / `htmlFor`, or the
 *  labels hydrate mismatched); every row added later takes a random one. */
export const blankCoffee = (id: string = newId()): CoffeeEntry => ({ ...EMPTY_COFFEE, id });

/** A coffee card linked to an existing usable coffee. Linked entries never
 *  submit field data (the server resolves by existingCoffeeId) — the
 *  create-only extras are reset. */
export function linkedEntry(base: CoffeeEntry, picked: UsableCoffee): CoffeeEntry {
  return {
    ...base,
    name: picked.name,
    producer: picked.producer ?? "",
    variety: picked.variety ?? "",
    altitude: picked.altitude ?? "",
    roastLevel: picked.roastLevel ?? "",
    country: picked.country ?? "",
    region: picked.region ?? "",
    farm: "",
    species: "",
    harvestYear: "",
    processType: picked.processType ?? "",
    certifications: [],
    notes: "",
    existingCoffeeId: picked.id,
    linkedOrigin: picked.origin,
  };
}

/** A fresh sample row. Its label stays EMPTY while `auto` (A4): the server
 *  assigns the letters at random when the session is created, so the wizard
 *  must not show a fixed "Muestra A" next to a coffee. */
export const autoSample = (coffeeId: string, id: string = newId()): SampleEntry => ({
  id,
  label: "",
  coffeeId,
  auto: true,
});

// ── The one list of samples ──────────────────────────────────────────────────

export type SampleList = {
  coffees: CoffeeEntry[];
  samples: SampleEntry[];
  referenceId: string | null;
};

/** Drops the card `coffeeId` when no sample points at it any more. Only that
 *  card: a card no sample uses from an older draft is left alone (the server
 *  drops it, as it always did). */
function dropIfUnused(coffees: CoffeeEntry[], samples: SampleEntry[], coffeeId: string): CoffeeEntry[] {
  return samples.some((s) => s.coffeeId === coffeeId) ? coffees : coffees.filter((c) => c.id !== coffeeId);
}

/** The one "add" action: a new sample with its own new coffee card (the 1:1
 *  case needs no further choice; "the same coffee as sample N" is a choice on
 *  the new row). Before S7a this was "+ Agregar otro café". */
export function addSample(list: SampleList): SampleList {
  const coffee = blankCoffee();
  return {
    ...list,
    coffees: [...list.coffees, coffee],
    samples: [...list.samples, autoSample(coffee.id)],
  };
}

/** Removes a sample (never the last one), its card when no other sample uses
 *  it, and the reference mark when it was on it. */
export function removeSample(list: SampleList, sampleId: string): SampleList {
  if (list.samples.length <= 1) return list;
  const removed = list.samples.find((s) => s.id === sampleId);
  if (!removed) return list;
  const samples = list.samples.filter((s) => s.id !== sampleId);
  return {
    coffees: dropIfUnused(list.coffees, samples, removed.coffeeId),
    samples,
    referenceId: list.referenceId === sampleId ? null : list.referenceId,
  };
}

/** What a sample's coffee is: its own card (`"own"`), or the card of another
 *  sample (that card's id). */
export type SampleCoffeeChoice = "own" | string;

/** `"own"` gives the sample a new blank card of its own (unless it already
 *  owns one); a card id makes it share that card. The card it leaves is dropped
 *  when nobody uses it any more. */
export function setSampleCoffee(list: SampleList, sampleId: string, choice: SampleCoffeeChoice): SampleList {
  const sample = list.samples.find((s) => s.id === sampleId);
  if (!sample) return list;
  if (choice === "own") {
    if (ownerOf(list.samples, sample.coffeeId) === sampleId) return list;
    const coffee = blankCoffee();
    const samples = list.samples.map((s) => (s.id === sampleId ? { ...s, coffeeId: coffee.id } : s));
    return {
      ...list,
      coffees: [...dropIfUnused(list.coffees, samples, sample.coffeeId), coffee],
      samples,
    };
  }
  if (choice === sample.coffeeId || !list.coffees.some((c) => c.id === choice)) return list;
  const samples = list.samples.map((s) => (s.id === sampleId ? { ...s, coffeeId: choice } : s));
  return { ...list, coffees: dropIfUnused(list.coffees, samples, sample.coffeeId), samples };
}

/** The sample a card is shown under: the first one that points at it. */
export function ownerOf(samples: SampleEntry[], coffeeId: string): string | null {
  return samples.find((s) => s.coffeeId === coffeeId)?.id ?? null;
}

/** For the row at `index`: the cards it may share, one per earlier sample that
 *  owns a card, with that sample's 1-based number. */
export function shareableCoffees(
  list: Pick<SampleList, "samples" | "coffees">,
  index: number,
): { coffeeId: string; sampleNumber: number; name: string }[] {
  const out: { coffeeId: string; sampleNumber: number; name: string }[] = [];
  list.samples.slice(0, index).forEach((s, i) => {
    if (ownerOf(list.samples, s.coffeeId) !== s.id) return;
    const coffee = list.coffees.find((c) => c.id === s.coffeeId);
    if (!coffee) return;
    out.push({ coffeeId: coffee.id, sampleNumber: i + 1, name: coffee.name.trim() });
  });
  return out;
}

// ── What the wizard posts ────────────────────────────────────────────────────

export type WizardSubmitState = {
  name: string;
  date: string;
  objective: string;
  format: SessionFormat;
  cupsPerSample: number;
  coffees: CoffeeEntry[];
  samples: SampleEntry[];
  referenceId: string | null;
  referenceMode: ReferenceMode;
  warmupOn: boolean;
  warmupId: WarmupId;
  locale: string;
  isGroup: boolean;
  closesAt: string;
  /** The browser's IANA zone; read only when a closing date is set. */
  zone: () => string | undefined;
  linkedGroupId: string;
  notifyGroup: boolean;
  notifyGroupWhen: NotifyWhen;
};

/** The exact argument of createSession (solo) or createGroupSession (group),
 *  with the same keys in the same order the form has always written them. */
export function buildWizardSubmission(state: WizardSubmitState) {
  const { coffees, samples, referenceId } = state;
  const idxById = new Map(coffees.map((c, i) => [c.id, i]));
  const coffeePayload = coffees.map((c) => {
    const { id, linkedOrigin, existingCoffeeId, ...rest } = c;
    void id;
    void linkedOrigin;
    return existingCoffeeId ? { ...rest, existingCoffeeId } : rest;
  });
  // An EMPTY label asks for a random letter (A4); a typed one is kept as is.
  // The A9 prep keys travel only when the owner filled them.
  const samplePayload = samples.map((s) => ({
    label: s.auto ? "" : s.label,
    coffeeIdx: idxById.get(s.coffeeId) ?? 0,
    ...(s.roastDate ? { roastDate: s.roastDate } : {}),
    ...(s.preparationNote?.trim() ? { preparationNote: s.preparationNote } : {}),
    ...(s.offProtocol
      ? {
          offProtocol: true,
          ...(s.offProtocolNote?.trim() ? { offProtocolNote: s.offProtocolNote } : {}),
        }
      : {}),
  }));
  const referenceIdx = referenceId
    ? ((idx) => (idx === -1 ? null : idx))(samples.findIndex((s) => s.id === referenceId))
    : null;

  if (!state.isGroup) {
    return {
      kind: "solo" as const,
      input: {
        name: state.name,
        date: state.date,
        objective: state.objective || undefined,
        format: state.format,
        cupsPerSample: state.cupsPerSample,
        coffees: coffeePayload,
        samples: samplePayload,
        referenceIdx,
        warmupExerciseId: state.warmupOn ? state.warmupId : null,
        referenceMode: referenceIdx === null ? DEFAULT_REFERENCE_MODE : state.referenceMode,
        locale: state.locale,
      },
    };
  }
  return {
    kind: "group" as const,
    input: {
      name: state.name,
      date: state.date,
      objective: state.objective || undefined,
      format: state.format,
      cupsPerSample: state.cupsPerSample,
      coffees: coffeePayload,
      samples: samplePayload,
      referenceIdx,
      warmupExerciseId: state.warmupOn ? state.warmupId : null,
      referenceMode: referenceIdx === null ? DEFAULT_REFERENCE_MODE : state.referenceMode,
      locale: state.locale,
      closesAt: state.closesAt || undefined,
      closesAtZone: state.closesAt ? state.zone() : undefined,
      groupId: state.linkedGroupId || undefined,
      notifyGroup: state.notifyGroup,
      notifyGroupWhen: state.notifyGroupWhen,
    },
  };
}
