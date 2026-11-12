import { describe, expect, it } from "vitest";
import {
  WIZARD_DRAFT_MAX_AGE_MS,
  clearWizardDrafts,
  isDraftDirty,
  isDraftDirtyFrom,
  parseDraft,
  serializeDraft,
  wizardDraftKey,
  type DraftCoffee,
  type WizardDraft,
} from "@/lib/wizardDraft";

const coffee = (over: Partial<DraftCoffee> = {}): DraftCoffee => ({
  id: "c1", name: "", producer: "", variety: "", altitude: "", roastLevel: "", country: "",
  region: "", farm: "", species: "", harvestYear: "", processType: "", certifications: [], notes: "",
  ...over,
});

const base = (over: Partial<WizardDraft> = {}): Omit<WizardDraft, "v" | "savedAt"> => ({
  name: "Cata", objective: "", format: "combined", cupsPerSample: 2, warmupOn: false,
  warmupId: "eyes", coffees: [coffee()], samples: [{ id: "s1", label: "Muestra A", coffeeId: "c1", auto: true }],
  referenceId: null, isGroup: false, closesAt: "", linkedGroupId: "", notifyGroup: true,
  notifyGroupWhen: "start",
  ...over,
});

describe("wizardDraft", () => {
  it("keys per user", () => {
    expect(wizardDraftKey("u1")).not.toBe(wizardDraftKey("u2"));
  });

  it("round-trips a draft", () => {
    const raw = serializeDraft(base(), 1000);
    expect(parseDraft(raw, 2000)?.name).toBe("Cata");
  });

  it("drops stale, malformed and foreign-shape drafts", () => {
    const raw = serializeDraft(base(), 0);
    expect(parseDraft(raw, WIZARD_DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(parseDraft("{not json", 0)).toBeNull();
    expect(parseDraft(null)).toBeNull();
    const dangling = serializeDraft(
      base({ samples: [{ id: "s1", label: "x", coffeeId: "ghost", auto: true }] }),
      0,
    );
    expect(parseDraft(dangling, 1)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 99, savedAt: 0 }), 1)).toBeNull();
  });

  it("only an edited form is dirty", () => {
    expect(isDraftDirty(base({ name: "" }))).toBe(false);
    expect(isDraftDirty(base({ name: "x" }))).toBe(true);
    expect(isDraftDirty(base({ name: "", coffees: [coffee({ country: "Perú" })] }))).toBe(true);
    expect(
      isDraftDirty(base({ name: "", samples: [
        { id: "s1", label: "A", coffeeId: "c1", auto: true },
        { id: "s2", label: "B", coffeeId: "c1", auto: true },
      ] })),
    ).toBe(true);
  });

  it("a prefilled but untouched form is not dirty relative to its initial state", () => {
    const initial = base({
      name: "",
      coffees: [coffee({ id: "p1", name: "Geisha", existingCoffeeId: "db1", linkedOrigin: "mine" })],
      samples: [{ id: "ps1", label: "Muestra A", coffeeId: "p1", auto: true }],
    });
    // Fresh random ids on re-render must not matter; content does.
    expect(isDraftDirty(initial)).toBe(true);
    expect(isDraftDirtyFrom(initial, initial)).toBe(false);
    expect(isDraftDirtyFrom(initial, structuredClone(initial))).toBe(false);
    expect(isDraftDirtyFrom({ ...initial, name: "Mi cata" }, initial)).toBe(true);
    expect(
      isDraftDirtyFrom({ ...initial, coffees: [{ ...initial.coffees[0], country: "Perú" }] }, initial),
    ).toBe(true);
    // An empty initial form behaves like the old rule.
    const empty = base({ name: "" });
    expect(isDraftDirtyFrom(empty, empty)).toBe(false);
    expect(isDraftDirtyFrom(base({ name: "x" }), empty)).toBe(true);
  });

  it("A4: a restored auto row has no label (old drafts stored 'Muestra A'), a typed one is kept", () => {
    const raw = serializeDraft(
      base({
        coffees: [coffee()],
        samples: [
          { id: "s1", label: "Muestra A", coffeeId: "c1", auto: true },
          { id: "s2", label: "Mi lote", coffeeId: "c1", auto: false },
        ],
      }),
      1000,
    );
    expect(parseDraft(raw, 2000)?.samples.map((s) => s.label)).toEqual(["", "Mi lote"]);
  });

  it("C8: the notice timing round-trips; an old draft without it reads as 'start'", () => {
    const created = parseDraft(serializeDraft(base({ notifyGroupWhen: "create" }), 1000), 2000);
    expect(created?.notifyGroupWhen).toBe("create");
    const legacy = JSON.parse(serializeDraft(base(), 1000));
    delete legacy.notifyGroupWhen;
    expect(parseDraft(JSON.stringify(legacy), 2000)?.notifyGroupWhen).toBe("start");
    legacy.notifyGroupWhen = "bogus";
    expect(parseDraft(JSON.stringify(legacy), 2000)?.notifyGroupWhen).toBe("start");
  });

  it("clearWizardDrafts removes every draft and nothing else", () => {
    const store = new Map<string, string>([
      [wizardDraftKey("u1"), "a"],
      [wizardDraftKey("u2"), "b"],
      ["cata_last_format", "combined"],
    ]);
    clearWizardDrafts({
      get length() { return store.size; },
      key: (i) => [...store.keys()][i] ?? null,
      removeItem: (k) => void store.delete(k),
    });
    expect([...store.keys()]).toEqual(["cata_last_format"]);
  });
});
