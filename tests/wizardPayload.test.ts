import { describe, expect, it } from "vitest";
import {
  addSample,
  autoSample,
  blankCoffee,
  buildWizardSubmission,
  EMPTY_COFFEE,
  linkedEntry,
  removeSample,
  setSampleCoffee,
  shareableCoffees,
  ownerOf,
  type CoffeeEntry,
  type SampleEntry,
  type SampleList,
  type WizardSubmitState,
} from "../app/[locale]/app/sessions/new/wizardModel";
import type { UsableCoffee } from "@/components/coffees/CoffeePicker";
import { pruneUnreferencedCoffees } from "@/lib/wizardCoffees";

// S7a (finding D-05): the wizard's two sections ("Cafés a evaluar" and
// "Muestras") became ONE list of samples. The server actions and their
// validators did not change, so the wizard must post exactly what it posted
// before for the same choices. This file keeps the OLD code as a frozen copy
// (taken from NewSessionForm.tsx at origin/main 4bd0333) and compares, field by
// field and shared reference by shared reference:
//   1. the old builder and the new one on the same form state;
//   2. what the OLD two-list screen and the NEW one-list screen post for the
//      same choices, each reached through its own buttons.

// ─── Frozen copy of the old code (do not edit: it is the reference) ──────────

const OLD_EMPTY_COFFEE = {
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
  certifications: [] as string[],
  notes: "",
};
const oldId = () => crypto.randomUUID();
const oldAutoSample = (coffeeId: string): SampleEntry => ({ id: oldId(), label: "", coffeeId, auto: true });

type OldState = { coffees: CoffeeEntry[]; samples: SampleEntry[]; referenceId: string | null };

function oldInitial(initialCoffee?: UsableCoffee, sampleCount = 1): OldState {
  const blank: CoffeeEntry = { ...OLD_EMPTY_COFFEE, id: oldId() };
  const coffees = [initialCoffee ? linkedEntry(blank, initialCoffee) : blank];
  return { coffees, samples: Array.from({ length: sampleCount }, () => oldAutoSample(coffees[0].id)), referenceId: null };
}
// The old screen's buttons, as they were (addCoffee, removeCoffee, addSample,
// removeSample, updateSampleCoffee, updateSampleLabel, applyExistingCoffee).
function oldAddCoffee(s: OldState): OldState {
  const coffeeId = oldId();
  return { ...s, coffees: [...s.coffees, { ...OLD_EMPTY_COFFEE, id: coffeeId }], samples: [...s.samples, oldAutoSample(coffeeId)] };
}
function oldRemoveCoffee(s: OldState, id: string): OldState {
  if (s.coffees.length <= 1) return s;
  const nextCoffees = s.coffees.filter((c) => c.id !== id);
  let nextSamples = s.samples.filter((x) => x.coffeeId !== id);
  if (nextSamples.length === 0) nextSamples = [oldAutoSample(nextCoffees[0].id)];
  const referenceId = s.referenceId && !nextSamples.some((x) => x.id === s.referenceId) ? null : s.referenceId;
  return { coffees: nextCoffees, samples: nextSamples, referenceId };
}
function oldAddSample(s: OldState): OldState {
  return { ...s, samples: [...s.samples, oldAutoSample(s.coffees[0].id)] };
}
function oldRemoveSample(s: OldState, id: string): OldState {
  if (s.samples.length <= 1) return s;
  return { ...s, samples: s.samples.filter((x) => x.id !== id), referenceId: s.referenceId === id ? null : s.referenceId };
}
function oldUpdateSampleCoffee(s: OldState, id: string, coffeeId: string): OldState {
  return { ...s, samples: s.samples.map((x) => (x.id === id ? { ...x, coffeeId } : x)) };
}

/** The old onSubmit's payload code and the two call literals, verbatim. */
function oldBuild(st: WizardSubmitState) {
  const { coffees, samples, referenceId } = st;
  const idxById = new Map(coffees.map((c, i) => [c.id, i]));
  const coffeePayload = coffees.map((c) => {
    const { id, linkedOrigin, existingCoffeeId, ...rest } = c;
    void id;
    void linkedOrigin;
    return existingCoffeeId ? { ...rest, existingCoffeeId } : rest;
  });
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
  if (!st.isGroup) {
    return {
      kind: "solo",
      input: {
        name: st.name,
        date: st.date,
        objective: st.objective || undefined,
        format: st.format,
        cupsPerSample: st.cupsPerSample,
        coffees: coffeePayload,
        samples: samplePayload,
        referenceIdx,
        warmupExerciseId: st.warmupOn ? st.warmupId : null,
        referenceMode: referenceIdx === null ? "anchor" : st.referenceMode,
        locale: st.locale,
      },
    };
  }
  return {
    kind: "group",
    input: {
      name: st.name,
      date: st.date,
      objective: st.objective || undefined,
      format: st.format,
      cupsPerSample: st.cupsPerSample,
      coffees: coffeePayload,
      samples: samplePayload,
      referenceIdx,
      warmupExerciseId: st.warmupOn ? st.warmupId : null,
      referenceMode: referenceIdx === null ? "anchor" : st.referenceMode,
      locale: st.locale,
      closesAt: st.closesAt || undefined,
      closesAtZone: st.closesAt ? st.zone() : undefined,
      groupId: st.linkedGroupId || undefined,
      notifyGroup: st.notifyGroup,
      notifyGroupWhen: st.notifyGroupWhen,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE: Omit<WizardSubmitState, "coffees" | "samples" | "referenceId"> = {
  name: "Prueba A",
  date: "2026-11-20",
  objective: "",
  format: "combined",
  cupsPerSample: 2,
  referenceMode: "anchor",
  warmupOn: false,
  warmupId: "eyes",
  locale: "es",
  isGroup: false,
  closesAt: "",
  zone: () => "America/Bogota",
  linkedGroupId: "",
  notifyGroup: true,
  notifyGroupWhen: "start",
};

const EXISTING: UsableCoffee = {
  id: "coffee-existing-1",
  name: "Café existente",
  code: "K7M3FP",
  producer: "Productor 1",
  variety: "Caturra",
  altitude: "1800",
  roastLevel: "Medio",
  country: "País 1",
  region: "Región 1",
  processType: "Lavado",
  origin: "mine",
};

/** Every place where the payload reuses an object it already holds: the server
 *  action's encoder writes such an object once and then a reference to it
 *  ("$0:0:coffees:0:certifications"), so equal JSON is not enough for an
 *  identical request body. */
function sharedRefs(value: unknown): string[] {
  const seen = new Map<object, string>();
  const out: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (v === null || typeof v !== "object") return;
    const first = seen.get(v);
    if (first !== undefined) {
      out.push(`${path} -> ${first}`);
      return;
    }
    seen.set(v, path);
    for (const [k, child] of Object.entries(v)) walk(child, `${path}.${k}`);
  };
  walk(value, "$");
  return out;
}

function expectSamePayload(a: ReturnType<typeof oldBuild>, b: ReturnType<typeof buildWizardSubmission>) {
  expect(b.kind).toBe(a.kind);
  // Field by field, keys in the same order (JSON.stringify keeps insertion order).
  expect(JSON.stringify(b.input)).toBe(JSON.stringify(a.input));
  expect(Object.keys(b.input)).toEqual(Object.keys(a.input));
  expect(b.input).toStrictEqual(a.input);
  expect(sharedRefs(b.input)).toEqual(sharedRefs(a.input));
}

const withList = (list: SampleList, extra: Partial<WizardSubmitState> = {}): WizardSubmitState => ({
  ...BASE,
  ...extra,
  coffees: list.coffees,
  samples: list.samples,
  referenceId: list.referenceId,
});

const patchCoffee = <T extends SampleList>(s: T, coffeeId: string, patch: Partial<CoffeeEntry>): T => ({
  ...s,
  coffees: s.coffees.map((c) => (c.id === coffeeId ? { ...c, ...patch } : c)),
});
const patchSample = <T extends SampleList>(s: T, sampleId: string, patch: Partial<SampleEntry>): T => ({
  ...s,
  samples: s.samples.map((x) => (x.id === sampleId ? { ...x, ...patch } : x)),
});
const label = <T extends SampleList>(s: T, sampleId: string, value: string): T =>
  patchSample(s, sampleId, { label: value, auto: value.trim() === "" });
const newInitial = (initialCoffee?: UsableCoffee, sampleCount = 1): SampleList => {
  const blank = blankCoffee();
  const coffees = [initialCoffee ? linkedEntry(blank, initialCoffee) : blank];
  return { coffees, samples: Array.from({ length: sampleCount }, () => autoSample(coffees[0].id)), referenceId: null };
};

// ─── 1. The builder: old and new on the same state ───────────────────────────

describe("S7a: the payload builder is the old one, moved", () => {
  const states: [string, () => WizardSubmitState][] = [
    ["a fresh form (one blank coffee, one sample)", () => withList(newInitial())],
    ["the express handoff (three samples of one coffee)", () => withList(newInitial(undefined, 3))],
    ["a linked coffee (Catar este café)", () => withList(newInitial(EXISTING))],
    [
      "solo, warm-up on, objective, a reference in free mode",
      () => {
        let s = addSample(newInitial());
        s = { ...s, referenceId: s.samples[1].id };
        return withList(s, { objective: "Objetivo", warmupOn: true, referenceMode: "free" });
      },
    ],
    [
      "group, live, linked group, notify at creation",
      () => withList(addSample(newInitial(EXISTING)), { isGroup: true, linkedGroupId: "group-1", notifyGroupWhen: "create" }),
    ],
    [
      "group with a closing date (zone sent) and no group",
      () => withList(newInitial(), { isGroup: true, closesAt: "2026-12-01", notifyGroup: false }),
    ],
    [
      "prep data: roast date, a blank note (not sent), off protocol with and without a note",
      () => {
        let s = addSample(addSample(newInitial()));
        s = patchSample(s, s.samples[0].id, { roastDate: "2026-11-10", preparationNote: "   " });
        s = patchSample(s, s.samples[1].id, { offProtocol: true, offProtocolNote: "Reposo de 3 horas" });
        s = patchSample(s, s.samples[2].id, { offProtocol: true, offProtocolNote: " ", preparationNote: "Agua 93" });
        return withList(s);
      },
    ],
    [
      "a reference whose sample id is no longer in the list (referenceIdx null, mode anchor)",
      () => withList({ ...newInitial(), referenceId: "gone" }, { referenceMode: "free" }),
    ],
    [
      "an old draft with a card no sample uses (still posted; the server drops it)",
      () => {
        const s = newInitial();
        return withList({ ...s, coffees: [...s.coffees, blankCoffee()] });
      },
    ],
  ];
  for (const [name, make] of states) {
    it(name, () => {
      const st = make();
      expectSamePayload(oldBuild(st), buildWizardSubmission(st));
    });
  }

  it("the zone is read only when a closing date is set", () => {
    let reads = 0;
    const zone = () => {
      reads += 1;
      return "Europe/Madrid";
    };
    buildWizardSubmission(withList(newInitial(), { isGroup: true, zone }));
    expect(reads).toBe(0);
    const r = buildWizardSubmission(withList(newInitial(), { isGroup: true, zone, closesAt: "2026-12-01" }));
    expect(reads).toBe(1);
    expect(r.input).toMatchObject({ closesAt: "2026-12-01", closesAtZone: "Europe/Madrid" });
  });

  it("new cards are spreads of the one EMPTY_COFFEE, so their blank certifications are shared as before", () => {
    const s = addSample(addSample(newInitial()));
    expect(s.coffees.every((c) => c.certifications === EMPTY_COFFEE.certifications)).toBe(true);
  });
});

// ─── 2. The same choices on the old screen and on the new one ────────────────

describe("S7a: the one list posts what the two lists posted for the same choices", () => {
  it("solo: a new coffee, a second new coffee with a typed label as the free reference, a repeat of the first, prep data, warm-up", () => {
    // Old screen: name card 1; "+ Agregar otro café" (card 2 + sample 2); "+ Agregar muestra" (sample 3 -> card 1).
    let o = oldInitial();
    o = patchCoffee(o, o.coffees[0].id, { name: "Prueba café A", country: "País 1" });
    o = oldAddCoffee(o);
    o = patchCoffee(o, o.coffees[1].id, { name: "Prueba café B" });
    o = oldAddSample(o);
    o = label(o, o.samples[1].id, "Control");
    o = { ...o, referenceId: o.samples[1].id };
    o = patchSample(o, o.samples[0].id, { roastDate: "2026-11-10" });

    // New screen: name sample 1's coffee; "+ Agregar muestra" twice; row 3 -> "the same coffee as sample 1".
    let n = newInitial();
    n = patchCoffee(n, n.coffees[0].id, { name: "Prueba café A", country: "País 1" });
    n = addSample(n);
    n = patchCoffee(n, n.coffees[1].id, { name: "Prueba café B" });
    n = addSample(n);
    n = setSampleCoffee(n, n.samples[2].id, n.samples[0].coffeeId);
    n = label(n, n.samples[1].id, "Control");
    n = { ...n, referenceId: n.samples[1].id };
    n = patchSample(n, n.samples[0].id, { roastDate: "2026-11-10" });

    const extra = { warmupOn: true, referenceMode: "free" as const, objective: "Objetivo de prueba", cupsPerSample: 3 };
    expectSamePayload(oldBuild(withList(o, extra)), buildWizardSubmission(withList(n, extra)));
    // The card the third row left behind is gone, not posted blank.
    expect(n.coffees).toHaveLength(2);
  });

  it("group live: an existing coffee as the anchor reference, a new coffee, and a sample removed and re-added", () => {
    // Old: link card 1; "+ Agregar otro café" twice; remove card 2 (and its sample); name card 3.
    let o = oldInitial();
    o = { ...o, coffees: [linkedEntry(o.coffees[0], EXISTING)] };
    o = oldAddCoffee(oldAddCoffee(o));
    o = oldRemoveCoffee(o, o.coffees[1].id);
    o = patchCoffee(o, o.coffees[1].id, { name: "Prueba café C" });
    o = { ...o, referenceId: o.samples[0].id };

    // New: link sample 1's coffee; "+ Agregar muestra" twice; remove sample 2; name sample 3's coffee.
    let n = newInitial();
    n = { ...n, coffees: [linkedEntry(n.coffees[0], EXISTING)] };
    n = addSample(addSample(n));
    n = removeSample(n, n.samples[1].id);
    n = patchCoffee(n, n.coffees[1].id, { name: "Prueba café C" });
    n = { ...n, referenceId: n.samples[0].id };

    const extra = { isGroup: true, linkedGroupId: "group-1", notifyGroupWhen: "start" as const };
    expectSamePayload(oldBuild(withList(o, extra)), buildWizardSubmission(withList(n, extra)));
  });

  it("group with a closing date: a typed label beside automatic ones, a label typed then cleared, an off-protocol note", () => {
    let o = oldInitial();
    o = patchCoffee(o, o.coffees[0].id, { name: "Prueba 1" });
    o = oldAddCoffee(oldAddCoffee(o));
    o = patchCoffee(o, o.coffees[1].id, { name: "Prueba 2" });
    o = patchCoffee(o, o.coffees[2].id, { name: "Prueba 3", certifications: ["4C"] });
    o = label(label(o, o.samples[0].id, "X"), o.samples[0].id, "");
    o = label(o, o.samples[2].id, "Lote 7");
    o = patchSample(o, o.samples[1].id, { offProtocol: true, offProtocolNote: "Molienda gruesa" });

    let n = newInitial();
    n = patchCoffee(n, n.coffees[0].id, { name: "Prueba 1" });
    n = addSample(addSample(n));
    n = patchCoffee(n, n.coffees[1].id, { name: "Prueba 2" });
    n = patchCoffee(n, n.coffees[2].id, { name: "Prueba 3", certifications: ["4C"] });
    n = label(label(n, n.samples[0].id, "X"), n.samples[0].id, "");
    n = label(n, n.samples[2].id, "Lote 7");
    n = patchSample(n, n.samples[1].id, { offProtocol: true, offProtocolNote: "Molienda gruesa" });

    const extra = { isGroup: true, closesAt: "2026-12-01", format: "affective" as const };
    expectSamePayload(oldBuild(withList(o, extra)), buildWizardSubmission(withList(n, extra)));
  });

  it("three samples: an existing coffee, a new one, and a repeat of the existing one; the reference removed with its sample", () => {
    let o = oldInitial(EXISTING);
    o = oldAddCoffee(o);
    o = patchCoffee(o, o.coffees[1].id, { name: "Prueba café N" });
    o = oldAddSample(o); // -> card 1, the existing coffee
    o = { ...o, referenceId: o.samples[1].id };
    o = oldRemoveSample(o, o.samples[1].id); // the reference goes with it
    o = oldAddCoffee(o);
    o = patchCoffee(o, o.coffees[2].id, { name: "Prueba café N" });

    let n = newInitial(EXISTING);
    n = addSample(n);
    n = patchCoffee(n, n.coffees[1].id, { name: "Prueba café N" });
    n = addSample(n);
    n = setSampleCoffee(n, n.samples[2].id, n.samples[0].coffeeId);
    n = { ...n, referenceId: n.samples[1].id };
    n = removeSample(n, n.samples[1].id);
    n = addSample(n);
    n = patchCoffee(n, n.coffees[1].id, { name: "Prueba café N" });

    // Old: the removed sample's card stays in the list unused (the server drops it
    // before validating); new: it is gone. Compared AFTER the server's own prune.
    expect(n.samples).toHaveLength(3);
    const ob = oldBuild(withList(o, { referenceMode: "free" }));
    const nb = buildWizardSubmission(withList(n, { referenceMode: "free" }));
    expect(ob.input.referenceIdx).toBeNull();
    expect(nb.input.referenceIdx).toBeNull();
    expect(nb.input.referenceMode).toBe("anchor");
    expect(JSON.stringify(prune(nb.input))).toBe(JSON.stringify(prune(ob.input)));
  });

  it("a row moved back from 'the same coffee as sample 1' to its own coffee gets a blank card at the end, as the old screen's add-then-reassign did", () => {
    let o = oldInitial();
    o = patchCoffee(o, o.coffees[0].id, { name: "Prueba café A" });
    o = oldAddSample(o); // sample 2 -> card 1
    o = oldAddCoffee(o); // card 2 + sample 3
    o = oldUpdateSampleCoffee(o, o.samples[1].id, o.coffees[1].id);
    o = oldRemoveSample(o, o.samples[2].id);
    o = patchCoffee(o, o.coffees[1].id, { name: "Prueba café B" });

    let n = newInitial();
    n = patchCoffee(n, n.coffees[0].id, { name: "Prueba café A" });
    n = addSample(n);
    n = setSampleCoffee(n, n.samples[1].id, n.samples[0].coffeeId);
    n = setSampleCoffee(n, n.samples[1].id, "own");
    n = patchCoffee(n, n.coffees[1].id, { name: "Prueba café B" });

    expectSamePayload(oldBuild(withList(o)), buildWizardSubmission(withList(n)));
  });
});

/** app/actions/sessions.ts runs lib/wizardCoffees.ts pruneUnreferencedCoffees first. */
function prune<T extends { coffees: unknown[]; samples: { coffeeIdx?: number }[] }>(input: T) {
  return { ...input, ...pruneUnreferencedCoffees(input.coffees, input.samples) };
}

// ─── 3. The list's own rules ─────────────────────────────────────────────────

describe("S7a: the one list of samples", () => {
  it("never removes the last sample, and keeps a shared card while a sample still uses it", () => {
    const one = newInitial();
    expect(removeSample(one, one.samples[0].id)).toBe(one);
    let s = addSample(newInitial());
    s = setSampleCoffee(s, s.samples[1].id, s.samples[0].coffeeId);
    expect(s.coffees).toHaveLength(1);
    const after = removeSample(s, s.samples[0].id);
    expect(after.coffees).toHaveLength(1);
    expect(ownerOf(after.samples, after.coffees[0].id)).toBe(after.samples[0].id);
  });

  it("a card is shown under the first sample that uses it; a row may share only an earlier row's card", () => {
    let s = addSample(addSample(newInitial()));
    s = patchCoffee(s, s.coffees[0].id, { name: "  Prueba café A " });
    s = setSampleCoffee(s, s.samples[2].id, s.samples[0].coffeeId);
    expect(shareableCoffees(s, 0)).toEqual([]);
    expect(shareableCoffees(s, 2)).toEqual([
      { coffeeId: s.coffees[0].id, sampleNumber: 1, name: "Prueba café A" },
      { coffeeId: s.coffees[1].id, sampleNumber: 2, name: "" },
    ]);
  });

  it("choosing 'own' on a row that already owns its card changes nothing; an unknown card id changes nothing", () => {
    const s = addSample(newInitial());
    expect(setSampleCoffee(s, s.samples[1].id, "own")).toBe(s);
    expect(setSampleCoffee(s, s.samples[1].id, "no-such-card")).toBe(s);
  });
});
