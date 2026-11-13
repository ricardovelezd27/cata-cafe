import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { MARKET_KEY, MARKET_NOTE_KEY } from "@/lib/marketNote";
import { DEFECT_TYPE_KEY } from "@/lib/cupDefects";
import {
  PIN_OVERWRITTEN_KEYS,
  REF_STASH_KEY,
  adoptServerPinKeys,
  isReferencePinned,
  pinReferenceAffective,
  planReferenceRestore,
  resolvePinnedPayload,
  restoreFromStash,
  stashBeforePin,
} from "@/lib/referenceRules";

// S10 WP5b review fixes (H1 server rule + client rule, M2 keys list, restore never blocks).

const NOW = new Date("2026-11-13T10:00:00.000Z");

function rated(value: number): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const a of AFFECTIVE_ATTRIBUTES) d[`${a.id}_final`] = value;
  d.tazas_no_uniformes = [true, false];
  d.tazas_defectuosas = [false, false];
  d.defecto_tipo = [];
  d.tazas_defecto_tipo = [null, null];
  return d;
}

describe("PIN_OVERWRITTEN_KEYS is derived from the pin itself (M2)", () => {
  it("every key the pin changes or removes is in the list, market note included", () => {
    const full: Record<string, unknown> = {
      ...rated(7),
      [MARKET_KEY]: "conocido",
      [MARKET_NOTE_KEY]: "nota",
      [DEFECT_TYPE_KEY]: ["moho", null],
      tazas_defectuosas: [true, false],
      notas: "x",
      aroma_int: 4,
    };
    const pinned = pinReferenceAffective(full, 2);
    const touched = new Set<string>();
    for (const k of new Set([...Object.keys(full), ...Object.keys(pinned)])) {
      if (JSON.stringify(full[k]) !== JSON.stringify(pinned[k])) touched.add(k);
    }
    expect(touched.size).toBeGreaterThan(8);
    for (const k of touched) expect(PIN_OVERWRITTEN_KEYS, k).toContain(k);
    expect(PIN_OVERWRITTEN_KEYS).toContain(MARKET_KEY);
    expect(PIN_OVERWRITTEN_KEYS).toContain(MARKET_NOTE_KEY);
  });

  it("the market note comes back with a restore", () => {
    const stored = { ...rated(7), [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: "n" };
    const pinned = pinReferenceAffective(stored, 2);
    expect(pinned[MARKET_KEY]).toBeUndefined();
    const res = restoreFromStash({ ...pinned, [REF_STASH_KEY]: stashBeforePin(stored, pinned, NOW) });
    expect(res.restored).toBe(true);
    expect(res.data[MARKET_KEY]).toBe("conocido");
    expect(res.data[MARKET_NOTE_KEY]).toBe("n");
  });
});

describe("resolvePinnedPayload (truth table)", () => {
  const stored = rated(7);
  const anchor = pinReferenceAffective(stored, 2);
  const base = { moduleKey: "affective", cupsPerSample: 2, now: NOW };

  it("pinned now: pins the payload and carries the stored stash", () => {
    const st = { ...anchor, [REF_STASH_KEY]: stashBeforePin(stored, anchor, NOW) };
    const r = resolvePinnedPayload({ ...base, pinsNow: true, pinnedView: true, posted: rated(9), stored: st });
    expect(isReferencePinned(r.data)).toBe(true);
    expect(r.refStash?.valores.fragancia_af_final).toBe(7);
  });

  it("pinned now, no stored stash: stash from the payload when it holds REAL ratings, else from the stored row", () => {
    const offline = resolvePinnedPayload({ ...base, pinsNow: true, pinnedView: false, posted: rated(8), stored: null });
    expect(offline.refStash?.valores.fragancia_af_final).toBe(8);
    const underPin = resolvePinnedPayload({ ...base, pinsNow: true, pinnedView: true, posted: anchor, stored });
    expect(underPin.refStash?.valores.fragancia_af_final).toBe(7);
  });

  it("not pinned now + pinnedView: pinned keys keep the STORED values, the rest comes from the payload, no stash", () => {
    const posted = { ...anchor, notas: "nueva", aroma_int: 4 };
    const r = resolvePinnedPayload({ ...base, pinsNow: false, pinnedView: true, posted, stored });
    expect(r.refStash).toBeNull();
    expect(r.data.fragancia_af_final).toBe(7);
    expect(r.data.tazas_no_uniformes).toEqual([true, false]);
    expect(r.data.notas).toBe("nueva");
    expect(r.data.aroma_int).toBe(4);
  });

  it("not pinned + pinnedView + nothing stored: the pinned keys are dropped", () => {
    const r = resolvePinnedPayload({ ...base, pinsNow: false, pinnedView: true, posted: anchor, stored: null });
    expect(r.data.fragancia_af_final).toBeUndefined();
  });

  it("not pinned, no pinnedView: an ordinary save, untouched", () => {
    const r = resolvePinnedPayload({ ...base, pinsNow: false, pinnedView: false, posted: rated(3), stored });
    expect(r.data).toEqual(rated(3));
    expect(r.refStash).toBeNull();
  });

  it("descriptive modules are never touched", () => {
    const posted = { aroma_int: 3 };
    const r = resolvePinnedPayload({ ...base, moduleKey: "descriptive", pinsNow: false, pinnedView: true, posted, stored });
    expect(r.data).toBe(posted);
  });
});

describe("adoptServerPinKeys (client rule)", () => {
  const anchorOf = (v: number) => pinReferenceAffective(rated(v), 2);
  it("server wins for the pinned keys only; local descriptive edits stay", () => {
    const out = adoptServerPinKeys({ ...anchorOf(7), notas: "mía", aroma_int: 5 }, rated(7));
    expect(out.fragancia_af_final).toBe(7);
    expect(out.notas).toBe("mía");
    expect(out.aroma_int).toBe(5);
  });
  it("a key the server row lacks is removed locally", () => {
    expect(adoptServerPinKeys(anchorOf(7), { notas: "x" }).fragancia_af_final).toBeUndefined();
  });
});

describe("planReferenceRestore never blocks the owner", () => {
  it("a row whose restored module fails validation is skipped (left pinned) and reported", () => {
    const pinned = pinReferenceAffective(rated(7), 2);
    const huge = { at: "t", valores: { tazas_defecto_tipo: ["x".repeat(70_000)] } };
    const { plan, skipped } = planReferenceRestore(
      [{ id: "bad", isDraft: false, affectiveData: { ...pinned, [REF_STASH_KEY]: huge }, combinedData: {} }],
      "affective",
      2,
    );
    expect(plan).toEqual([]);
    expect(skipped).toEqual(["bad"]);
  });
});
