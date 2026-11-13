import { describe, expect, it } from "vitest";
import { backupEntryFor, hydrateModule, planHydration, type HydrationBlob } from "@/lib/pinnedViewHydration";
import { pinReferenceAffective } from "@/lib/referenceRules";

const rated = (v: number) => ({ fragancia_af_final: v, tazas_no_uniformes: [true, false] });
const pinned = { ...pinReferenceAffective(rated(7), 2), notas: "mía" };
const isKey = (k: string) => k === "affective" || k === "combined";

describe("backupEntryFor", () => {
  it("carries pinnedView only when true", () => {
    const base = { sampleId: "A", label: "A", key: "affective", data: pinned };
    expect(backupEntryFor(base, 5, true).pinnedView).toBe(true);
    expect("pinnedView" in backupEntryFor(base, 5, false)).toBe(false);
  });
});

describe("hydrateModule", () => {
  it("unflagged: untouched", () => {
    const r = hydrateModule({ data: pinned, stillPinned: false, server: rated(7) });
    expect(r).toEqual({ data: pinned, pinnedView: false, adopted: false });
  });
  it("flagged and still pinned: kept, flag kept", () => {
    const r = hydrateModule({ data: pinned, pinnedView: true, stillPinned: true, server: rated(7) });
    expect(r.pinnedView).toBe(true);
    expect(r.adopted).toBe(false);
    expect(r.data).toBe(pinned);
  });
  it("flagged and NOT pinned any more: server wins for the pinned keys, local edits stay, flag dropped", () => {
    const r = hydrateModule({ data: pinned, pinnedView: true, stillPinned: false, server: rated(7) });
    expect(r.adopted).toBe(true);
    expect(r.pinnedView).toBe(false);
    expect(r.data.fragancia_af_final).toBe(7);
    expect(r.data.notas).toBe("mía");
  });
});

describe("planHydration (mount)", () => {
  const blob = (pinnedView?: boolean, updatedAt = 10): HydrationBlob => ({
    samples: { A: { label: "A", modules: { affective: { data: pinned, updatedAt, pinnedView, hydrates: true } } } },
  });
  const common = { isModuleKey: isKey, serverModule: () => rated(7) };

  it("path 2: an IndexedDB module flagged pinnedView on a sample that is no longer pinned adopts the server's keys", () => {
    const plan = planHydration({ blob: blob(true), backup: [], stillPinned: () => false, ...common });
    const m = plan.get("A|affective")!;
    expect(m.adopted).toBe(true);
    expect(m.pinnedView).toBe(false);
    expect(m.data.fragancia_af_final).toBe(7);
  });
  it("path 2: still pinned keeps the mark so the next save carries it", () => {
    const m = planHydration({ blob: blob(true), backup: [], stillPinned: () => true, ...common }).get("A|affective")!;
    expect(m.pinnedView).toBe(true);
    expect(m.adopted).toBe(false);
  });
  it("path 1: a backup entry carrying the flag keeps it through promotion (still pinned)", () => {
    const entry = backupEntryFor({ sampleId: "A", label: "A", key: "affective", data: pinned }, 20, true);
    const m = planHydration({ blob: blob(false, 10), backup: [entry], stillPinned: () => true, ...common }).get("A|affective")!;
    expect(m.fromBackup).toBe(true);
    expect(m.pinnedView).toBe(true);
  });
  it("path 1: a flagged backup on an unpinned sample adopts the server's keys", () => {
    const entry = backupEntryFor({ sampleId: "A", label: "A", key: "affective", data: pinned }, 20, true);
    const m = planHydration({ blob: null, backup: [entry], stillPinned: () => false, ...common }).get("A|affective")!;
    expect(m.adopted).toBe(true);
    expect(m.data.fragancia_af_final).toBe(7);
  });
  it("a backup older than the stored module never regresses it", () => {
    const entry = backupEntryFor({ sampleId: "A", label: "A", key: "affective", data: { x: 1 } }, 5, false);
    const m = planHydration({ blob: blob(false, 10), backup: [entry], stillPinned: () => false, ...common }).get("A|affective")!;
    expect(m.fromBackup).toBe(false);
    expect(m.data).toBe(pinned);
  });
  it("modules that do not hydrate (conflict, closed...) or are not evaluation modules are skipped", () => {
    const b: HydrationBlob = {
      samples: { A: { label: "A", modules: { affective: { data: pinned, updatedAt: 1, hydrates: false }, physical: { data: {}, updatedAt: 1, hydrates: true } } } },
    };
    expect(planHydration({ blob: b, backup: [], stillPinned: () => false, ...common }).size).toBe(0);
  });
});
