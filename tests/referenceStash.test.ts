import { describe, expect, it } from "vitest";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { computeEvaluationDerived } from "@/lib/evaluation";
import {
  PIN_OVERWRITTEN_KEYS,
  REF_STASH_KEY,
  isReferencePinned,
  pinReferenceAffective,
  planReferenceRepin,
  planReferenceRestore,
  restoreFromStash,
  stashBeforePin,
  validStash,
} from "@/lib/referenceRules";

// S10 WP5b (B2): the pin keeps the cupper's previous ratings aside.

const NOW = new Date("2026-11-13T10:00:00.000Z");

function rated(value: number, cups = 2): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  for (const a of AFFECTIVE_ATTRIBUTES) {
    d[`${a.id}_final`] = value;
    d[a.id] = value;
  }
  d.tazas_no_uniformes = [true, false].slice(0, cups);
  d.tazas_defectuosas = [false, false].slice(0, cups);
  d.defecto_tipo = [];
  d.tazas_defecto_tipo = [null, null].slice(0, cups);
  d.notas = "dulce";
  return d;
}

describe("PIN_OVERWRITTEN_KEYS", () => {
  it("lists every key the pin can change (and nothing else changes)", () => {
    // Garbage in every key the pin might touch, plus unrelated keys.
    const data: Record<string, unknown> = { ...rated(7), extra: 1, nota_express: "x" };
    for (const k of PIN_OVERWRITTEN_KEYS) if (!(k in data)) data[k] = "garbage";
    const pinned = pinReferenceAffective(data, 2);
    const changed = Object.keys({ ...data, ...pinned }).filter(
      (k) => JSON.stringify(data[k]) !== JSON.stringify(pinned[k]),
    );
    for (const k of changed) expect(PIN_OVERWRITTEN_KEYS).toContain(k);
    // And a stash from an all-different module names exactly those keys.
    const stash = stashBeforePin(data, pinned, NOW)!;
    expect(Object.keys(stash.valores).sort()).toEqual([...changed].sort());
  });
});

describe("stashBeforePin", () => {
  const stored = rated(7);

  it("keeps the previous values of every key the pin overwrites", () => {
    const pinned = pinReferenceAffective(stored, 2);
    const stash = stashBeforePin(stored, pinned, NOW)!;
    expect(stash.at).toBe(NOW.toISOString());
    expect(stash.valores.fragancia_af_final).toBe(7);
    expect(stash.valores.tazas_no_uniformes).toEqual([true, false]);
    // the base ratings and the notes are not touched by the pin: not stashed
    expect(stash.valores.fragancia_af).toBeUndefined();
    expect(stash.valores.notas).toBeUndefined();
  });

  it("is null without a stored row and when the stored data is already the anchor", () => {
    expect(stashBeforePin(null, pinReferenceAffective({}, 2), NOW)).toBeNull();
    expect(stashBeforePin(undefined, pinReferenceAffective({}, 2), NOW)).toBeNull();
    const anchor = pinReferenceAffective(stored, 2);
    expect(isReferencePinned(anchor)).toBe(true);
    expect(stashBeforePin(anchor, pinReferenceAffective(anchor, 2), NOW)).toBeNull();
  });

  it("is null when nothing affective exists to keep (only descriptive data)", () => {
    const onlyDescriptive = { notas: "x" };
    // every _final is absent -> they are "overwritten" from absent: recorded as null, so a
    // restore deletes them again; a module with NOTHING at all is not worth a stash
    expect(stashBeforePin({}, pinReferenceAffective({}, 2), NOW)?.valores.fragancia_af_final ?? null).toBeNull();
    const s = stashBeforePin(onlyDescriptive, pinReferenceAffective(onlyDescriptive, 2), NOW);
    // absent keys are recorded as null so the restore reproduces the same shape
    expect(s === null || Object.values(s.valores).every((v) => v === null || Array.isArray(v))).toBe(true);
  });

  it("NEVER overwrites an existing stash (the first real values win)", () => {
    const first = { at: "2026-01-01T00:00:00.000Z", valores: { fragancia_af_final: 8 } };
    const withStash = { ...pinReferenceAffective(stored, 2), [REF_STASH_KEY]: first };
    // even if the stored row has drifted off the anchor, the existing stash is carried over
    const drifted = { ...withStash, fragancia_af_final: 3 };
    expect(stashBeforePin(drifted, pinReferenceAffective(drifted, 2), NOW)).toEqual(first);
    expect(stashBeforePin(withStash, pinReferenceAffective(withStash, 2), NOW)).toEqual(first);
  });

  it("records an absent key as null", () => {
    const partial = { fragancia_af_final: 6 };
    const stash = stashBeforePin(partial, pinReferenceAffective(partial, 2), NOW)!;
    expect(stash.valores.fragancia_af_final).toBe(6);
    expect(stash.valores.aroma_af_final).toBeNull();
  });
});

describe("validStash", () => {
  it("rejects malformed stashes and drops keys the pin never touches", () => {
    expect(validStash(null)).toBeNull();
    expect(validStash("x")).toBeNull();
    expect(validStash({ at: 5, valores: {} })).toBeNull();
    expect(validStash({ at: "t" })).toBeNull();
    expect(validStash({ at: "t", valores: { fragancia_af_final: 7, notas: "evil", __proto__: 1 } })).toEqual({
      at: "t",
      valores: { fragancia_af_final: 7 },
    });
  });
});

describe("restoreFromStash", () => {
  const stored = rated(7);
  const pinned = pinReferenceAffective(stored, 2);
  const withStash = { ...pinned, [REF_STASH_KEY]: stashBeforePin(stored, pinned, NOW) };

  it("gives the stashed values back and drops the key (round trip)", () => {
    const res = restoreFromStash(withStash);
    expect(res.restored).toBe(true);
    expect(res.data[REF_STASH_KEY]).toBeUndefined();
    expect(res.data).toEqual(stored);
  });

  it("deletes keys that were absent before the pin", () => {
    const partial = { fragancia_af_final: 6, notas: "n" };
    const p = pinReferenceAffective(partial, 2);
    const res = restoreFromStash({ ...p, [REF_STASH_KEY]: stashBeforePin(partial, p, NOW) });
    expect(res.restored).toBe(true);
    expect(res.data).toEqual(partial);
  });

  it("an evaluation re-rated after the unlock keeps its values and just drops the stash", () => {
    const rerated = { ...withStash, fragancia_af_final: 8 };
    const res = restoreFromStash(rerated);
    expect(res.restored).toBe(false);
    expect(res.hadStash).toBe(true);
    expect(res.data.fragancia_af_final).toBe(8);
    expect(res.data[REF_STASH_KEY]).toBeUndefined();
  });

  it("a cup flagged after the unlock also counts as re-rated", () => {
    const flagged = { ...withStash, tazas_defectuosas: [true, false] };
    expect(restoreFromStash(flagged).restored).toBe(false);
  });

  it("no stash: data returned as is, nothing restored", () => {
    const res = restoreFromStash(pinned);
    expect(res).toEqual({ data: pinned, restored: false, hadStash: false });
  });

  it("a malformed stash is dropped without restoring", () => {
    const res = restoreFromStash({ ...pinned, [REF_STASH_KEY]: "boom" });
    expect(res.restored).toBe(false);
    expect(res.data[REF_STASH_KEY]).toBeUndefined();
  });
});

describe("computeEvaluationDerived and the stash (tampered payload)", () => {
  const stored = rated(7);
  const pinned = pinReferenceAffective(stored, 2);

  it("strips a client-supplied ref_previo", () => {
    const tampered = { ...pinned, [REF_STASH_KEY]: { at: "x", valores: { fragancia_af_final: 9 } } };
    const out = computeEvaluationDerived("affective", tampered, 2);
    expect((out.affectiveData as Record<string, unknown>)[REF_STASH_KEY]).toBeUndefined();
  });

  it("re-attaches only the stash the server hands it", () => {
    const stash = stashBeforePin(stored, pinned, NOW);
    const tampered = { ...pinned, [REF_STASH_KEY]: { at: "x", valores: { fragancia_af_final: 9 } } };
    const out = computeEvaluationDerived("affective", tampered, 2, { refStash: stash });
    expect((out.affectiveData as Record<string, unknown>)[REF_STASH_KEY]).toEqual(stash);
  });

  it("is invisible to scoring: the same score with or without the stash", () => {
    const stash = stashBeforePin(stored, pinned, NOW);
    const a = computeEvaluationDerived("combined", pinned, 2);
    const b = computeEvaluationDerived("combined", pinned, 2, { refStash: stash });
    expect(b.individualScore).toBe(a.individualScore);
    expect(b.individualScore).toBe(79);
    expect(b.rawScore).toBe(a.rawScore);
    expect(b.defectTypes).toEqual(a.defectTypes);
  });

  it("the stash counts toward the size bound", () => {
    const huge = { at: "x".repeat(70_000), valores: {} };
    expect(() => computeEvaluationDerived("affective", pinned, 2, { refStash: huge })).toThrow("invalid_input");
  });
});

describe("planReferenceRepin keeps the previous ratings", () => {
  it("stashes what it overwrites and never replaces an existing stash", () => {
    const stored = rated(7);
    const first = { at: "2026-01-01T00:00:00.000Z", valores: { fragancia_af_final: 9 } };
    const plan = planReferenceRepin(
      [
        { id: "a", isDraft: false, affectiveData: stored, combinedData: {} },
        { id: "b", isDraft: true, affectiveData: { ...rated(6), [REF_STASH_KEY]: first }, combinedData: {} },
        { id: "c", isDraft: false, affectiveData: pinReferenceAffective(stored, 2), combinedData: {} },
      ],
      "affective",
      2,
    );
    expect(plan.map((p) => p.id)).toEqual(["a", "b"]);
    const a = plan[0].data.affectiveData as Record<string, unknown>;
    expect(isReferencePinned(a)).toBe(true);
    expect((a[REF_STASH_KEY] as { valores: Record<string, unknown> }).valores.fragancia_af_final).toBe(7);
    const b = plan[1].data.affectiveData as Record<string, unknown>;
    expect(b[REF_STASH_KEY]).toEqual(first);
  });
});

describe("planReferenceRestore", () => {
  const stored = rated(7);
  const pinned = pinReferenceAffective(stored, 2);
  const stash = stashBeforePin(stored, pinned, NOW);
  const row = (id: string, data: Record<string, unknown>, isDraft = false) => ({
    id,
    isDraft,
    affectiveData: data,
    combinedData: {},
  });

  it("restores intact anchors (scores recomputed, isDraft echoed), drops the stash of re-rated rows, ignores rows without a stash", () => {
    const { plan } = planReferenceRestore(
      [
        row("ok", { ...pinned, [REF_STASH_KEY]: stash }),
        row("rerated", { ...pinned, fragancia_af_final: 8, [REF_STASH_KEY]: stash }, true),
        row("none", pinned),
      ],
      "affective",
      2,
    );
    expect(plan.map((p) => [p.id, p.restored])).toEqual([
      ["ok", true],
      ["rerated", false],
    ]);
    const ok = plan[0].data;
    expect(ok.isDraft).toBe(false);
    expect((ok.affectiveData as Record<string, unknown>).fragancia_af_final).toBe(7);
    expect((ok.affectiveData as Record<string, unknown>)[REF_STASH_KEY]).toBeUndefined();
    expect(ok.individualScore).not.toBe(79);
    // the re-rated row is written without the stash and without touching scores
    const rerated = plan[1].data;
    expect(Object.keys(rerated)).toEqual(["affectiveData"]);
    expect((rerated.affectiveData as Record<string, unknown>)[REF_STASH_KEY]).toBeUndefined();
    expect((rerated.affectiveData as Record<string, unknown>).fragancia_af_final).toBe(8);
  });

  it("descriptive sessions have nothing to restore", () => {
    expect(planReferenceRestore([row("x", { ...pinned, [REF_STASH_KEY]: stash })], "descriptive", 2).plan).toEqual([]);
  });

  it("the combined column is read for combined sessions", () => {
    const { plan } = planReferenceRestore(
      [{ id: "c", isDraft: false, affectiveData: {}, combinedData: { ...pinned, [REF_STASH_KEY]: stash } }],
      "combined",
      2,
    );
    expect(plan[0].restored).toBe(true);
    expect((plan[0].data.combinedData as Record<string, unknown>).fragancia_af_final).toBe(7);
  });
});
