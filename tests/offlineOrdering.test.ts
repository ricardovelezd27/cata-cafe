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
import {
  CLIENT_TS_MAX_FUTURE_MS,
  effectiveClientTs,
  sanitizeClientTs,
  shouldApplyClientWrite,
} from "@/lib/offline/clientWrite";
import type { OfflineModuleData, OfflineSessionBlob } from "@/lib/offline/types";

describe("server-side ordering of client writes (S8-18, F-offline-2)", () => {
  const now = 1_700_000_000_000;
  const last = new Date(now - 10_000);

  it("applies when the write carries no timestamp (cached bundles)", () => {
    expect(shouldApplyClientWrite(last, undefined, now)).toBe(true);
    expect(shouldApplyClientWrite(last, null, now)).toBe(true);
  });

  it("applies over a row that never recorded one", () => {
    expect(shouldApplyClientWrite(null, now - 1, now)).toBe(true);
    expect(shouldApplyClientWrite(undefined, now - 1, now)).toBe(true);
  });

  it("ignores a strictly older write", () => {
    expect(shouldApplyClientWrite(last, now - 10_001, now)).toBe(false);
  });

  it("applies an equal write (idempotent resend) and a newer one", () => {
    expect(shouldApplyClientWrite(last, now - 10_000, now)).toBe(true);
    expect(shouldApplyClientWrite(last, now - 5_000, now)).toBe(true);
  });

  it("treats a far-future timestamp as absent, not as the newest write", () => {
    const far = now + CLIENT_TS_MAX_FUTURE_MS + 1;
    expect(sanitizeClientTs(far, now)).toBeUndefined();
    expect(shouldApplyClientWrite(last, far, now)).toBe(true);
    expect(sanitizeClientTs(now + CLIENT_TS_MAX_FUTURE_MS, now)).toBe(now + CLIENT_TS_MAX_FUTURE_MS);
  });

  it("treats NaN, Infinity, fractions, negatives and non-numbers as absent", () => {
    for (const bad of [NaN, Infinity, -Infinity, 1.5, -5, 0, "123", {}, []]) {
      expect(sanitizeClientTs(bad, now)).toBeUndefined();
      expect(shouldApplyClientWrite(last, bad, now)).toBe(true);
    }
  });

  it("accepts a Date or a number for the stored value", () => {
    expect(shouldApplyClientWrite(now - 10_000, now - 10_001, now)).toBe(false);
    expect(shouldApplyClientWrite(NaN, now - 1, now)).toBe(true);
  });
});

describe("client stamp clamp to the server clock (S8-18 review)", () => {
  const now = 1_700_000_000_000;

  it("stores a slightly-future stamp as now", () => {
    expect(effectiveClientTs(now + 4 * 60_000, now)).toBe(now);
    expect(effectiveClientTs(now - 5_000, now)).toBe(now - 5_000);
    expect(effectiveClientTs(now + CLIENT_TS_MAX_FUTURE_MS + 1, now)).toBeUndefined();
    expect(effectiveClientTs("x", now)).toBeUndefined();
  });

  it("a fast clock does not make a later honest write look stale", () => {
    // Write A: device clock 4 min fast, stored clamped to server now.
    const stored = effectiveClientTs(now + 4 * 60_000, now)!;
    // Write B: honest clock, 1 s later.
    expect(shouldApplyClientWrite(stored, now + 1_000, now + 1_000)).toBe(true);
  });

  it("equal stamps still apply", () => {
    expect(shouldApplyClientWrite(now, now, now)).toBe(true);
    expect(shouldApplyClientWrite(now, now + 60_000, now)).toBe(true);
  });
});

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
