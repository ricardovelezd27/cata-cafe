import { describe, expect, it } from "vitest";
import {
  applyOutcome,
  countStatuses,
  deviceOnlyCount,
  rekeyBlob,
  retryDelayMs,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
} from "@/lib/offline/status";
import type { OfflineModuleData, OfflineSessionBlob } from "@/lib/offline/types";

const mod = (over: Partial<OfflineModuleData> = {}): OfflineModuleData => ({
  data: {},
  syncStatus: "pending",
  updatedAt: 100,
  ...over,
});

describe("replay ordering (F-offline-2)", () => {
  it("an edit made during the replay leaves the module pending", () => {
    // replay snapshot was taken at updatedAt 100; the cupper edited at 250
    const edited = mod({ updatedAt: 250, data: { v: 2 } });
    expect(applyOutcome(edited, "synced", { ifUpdatedAt: 100 })).toBeNull();
  });
  it("applies when nothing changed meanwhile", () => {
    expect(applyOutcome(mod(), "synced", { ifUpdatedAt: 100 })?.syncStatus).toBe("synced");
  });
  it("an older response arriving after a newer one cannot regress the row", () => {
    const afterNewer = mod({ updatedAt: 300, syncStatus: "pending" });
    expect(applyOutcome(afterNewer, "conflict", { ifUpdatedAt: 100 })).toBeNull();
  });
});

describe("retry schedule (F-offline-6)", () => {
  const mid = () => 0.5; // zero jitter
  it("starts at 15 s and doubles", () => {
    expect(retryDelayMs(1, mid)).toBe(RETRY_BASE_MS);
    expect(retryDelayMs(2, mid)).toBe(RETRY_BASE_MS * 2);
    expect(retryDelayMs(3, mid)).toBe(RETRY_BASE_MS * 4);
  });
  it("caps at 5 minutes and stays within jitter bounds", () => {
    expect(retryDelayMs(20, mid)).toBe(RETRY_MAX_MS);
    expect(retryDelayMs(20, () => 1)).toBeLessThanOrEqual(RETRY_MAX_MS * 1.2);
    expect(retryDelayMs(1, () => 0)).toBeGreaterThanOrEqual(RETRY_BASE_MS * 0.8 - 1);
  });
});

const blob = (userId: string, mods: Record<string, OfflineModuleData>): OfflineSessionBlob => ({
  sessionId: "s1",
  userId,
  updatedAt: 10,
  format: "affective",
  cupsPerSample: 5,
  samples: { a: { label: "A", modules: mods } },
});

describe("counts", () => {
  it("counts every status and device-only = all but synced", () => {
    const c = countStatuses([
      blob("u", {
        affective: mod(),
        descriptive: mod({ syncStatus: "synced" }),
        physical: mod({ syncStatus: "orphaned" }),
        extrinsic: mod({ syncStatus: "closed_unsent" }),
      }),
    ]);
    expect(c.pending).toBe(1);
    expect(c.synced).toBe(1);
    expect(deviceOnlyCount(c)).toBe(3);
  });
});

describe("rekeyBlob (guest claim, F-guest-5)", () => {
  it("moves the work to the new user", () => {
    const out = rekeyBlob(blob("anon", { affective: mod() }), "real");
    expect(out.userId).toBe("real");
    expect(out.samples.a.modules.affective?.syncStatus).toBe("pending");
  });
  it("merges with an existing blob; the newer module wins", () => {
    const existing = blob("real", { affective: mod({ updatedAt: 500, data: { keep: 1 } }) });
    const from = blob("anon", {
      affective: mod({ updatedAt: 200, data: { old: 1 } }),
      descriptive: mod({ updatedAt: 200 }),
    });
    const out = rekeyBlob(from, "real", existing);
    expect(out.samples.a.modules.affective?.data).toEqual({ keep: 1 });
    expect(out.samples.a.modules.descriptive).toBeDefined();
  });
});
