import { describe, expect, it } from "vitest";
import { warmupForCache, warmupFromCache } from "@/lib/warmup/offlineCache";

const live = {
  exerciseId: "ex1",
  hasOwnEvaluation: false,
  warmupStartedAt: "2026-11-10T10:00:00.000Z",
  serverNow: "2026-11-10T10:00:05.000Z",
  strings: { start: "Empezar" },
};

describe("warmup offline cache", () => {
  it("never caches the live run clock", () => {
    const cached = warmupForCache(live);
    expect(cached).not.toBeNull();
    expect(cached).not.toHaveProperty("warmupStartedAt");
    expect(cached).not.toHaveProperty("serverNow");
    expect(cached?.exerciseId).toBe("ex1");
  });
  it("rebuilds without a run, with a fresh server clock", () => {
    const out = warmupFromCache(warmupForCache(live), {
      hasLocalWork: false,
      nowIso: "2026-11-11T08:00:00.000Z",
    });
    expect(out?.warmupStartedAt).toBeNull();
    expect(out?.serverNow).toBe("2026-11-11T08:00:00.000Z");
    expect(out?.hasOwnEvaluation).toBe(false);
  });
  it("a cupper with local work counts as returning (overlay stays closed)", () => {
    const out = warmupFromCache(warmupForCache(live), { hasLocalWork: true, nowIso: "x" });
    expect(out?.hasOwnEvaluation).toBe(true);
  });
  it("absent warm-up stays absent", () => {
    expect(warmupForCache(undefined)).toBeNull();
    expect(warmupFromCache(null, { hasLocalWork: true, nowIso: "x" })).toBeUndefined();
  });
});
