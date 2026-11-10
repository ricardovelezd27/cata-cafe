import { describe, expect, it } from "vitest";
import {
  applyOutcome,
  ORPHAN_WARN_MAX_AGE_MS,
  phaseAfterPass,
  warnableCount,
} from "@/lib/offline/status";
import type { OfflineModuleData, OfflineSessionBlob } from "@/lib/offline/types";

const mod = (over: Partial<OfflineModuleData> = {}): OfflineModuleData => ({
  data: {},
  syncStatus: "pending",
  updatedAt: 100,
  ...over,
});

const blob = (mods: Record<string, OfflineModuleData>): OfflineSessionBlob => ({
  sessionId: "s",
  userId: "u",
  updatedAt: 1,
  format: "affective",
  cupsPerSample: 5,
  samples: { a: { label: "A", modules: mods } },
});

describe("phaseAfterPass (S8-23, C-05a)", () => {
  it("a draft only waiting for the session to start is neutral, not failed", () => {
    expect(phaseAfterPass({ anyRetry: false, stuck: false, anyWaiting: true })).toBe("idle");
  });
  it("a real retry or a parked module is still failed, even with a waiting one", () => {
    expect(phaseAfterPass({ anyRetry: true, stuck: false, anyWaiting: true })).toBe("failed");
    expect(phaseAfterPass({ anyRetry: false, stuck: true, anyWaiting: false })).toBe("failed");
  });
  it("nothing outstanding is synced", () => {
    expect(phaseAfterPass({ anyRetry: false, stuck: false, anyWaiting: false })).toBe("synced");
  });
});

describe("warnableCount (S8-23, C-05b)", () => {
  const now = 2_000_000_000_000;
  it("ignores orphaned notes older than 30 days but keeps recent ones", () => {
    const old = mod({ syncStatus: "orphaned", updatedAt: now - ORPHAN_WARN_MAX_AGE_MS - 1 });
    const recent = mod({ syncStatus: "orphaned", updatedAt: now - 1000 });
    expect(warnableCount([blob({ affective: old })], now)).toBe(0);
    expect(warnableCount([blob({ affective: old, descriptive: recent })], now)).toBe(1);
  });
  it("still counts every other unsynced status regardless of age", () => {
    const ancient = now - 10 * ORPHAN_WARN_MAX_AGE_MS;
    const b = blob({
      affective: mod({ updatedAt: ancient }),
      descriptive: mod({ syncStatus: "failed", updatedAt: ancient }),
      physical: mod({ syncStatus: "conflict", updatedAt: ancient }),
      extrinsic: mod({ syncStatus: "closed_unsent", updatedAt: ancient }),
    });
    expect(warnableCount([b], now)).toBe(4);
  });
  it("never counts synced modules", () => {
    expect(warnableCount([blob({ affective: mod({ syncStatus: "synced" }) })], now)).toBe(0);
  });
});

describe("a retry that was not due does not consume an attempt (S8-23, C-05c)", () => {
  const now = 1_000_000;
  it("keeps attempts when the next timed attempt is still in the future", () => {
    const m = mod({ attempts: 3, nextAttemptAt: now + 60_000 });
    const out = applyOutcome(m, "retry", { now });
    expect(out?.attempts).toBe(3);
    expect(out?.syncStatus).toBe("pending");
    expect(out?.nextAttemptAt).toBe(now + 60_000);
  });
  it("five not-due failures never park the draft", () => {
    let m = mod({ attempts: 1, nextAttemptAt: now + 60_000 });
    for (let i = 0; i < 10; i++) m = applyOutcome(m, "retry", { now })!;
    expect(m.syncStatus).toBe("pending");
    expect(m.attempts).toBe(1);
  });
  it("a due (or first) failed attempt still counts", () => {
    expect(applyOutcome(mod({ attempts: 1, nextAttemptAt: now - 1 }), "retry", { now })?.attempts).toBe(2);
    expect(applyOutcome(mod(), "retry", { now })?.attempts).toBe(1);
    expect(applyOutcome(mod({ attempts: 4, nextAttemptAt: now - 1 }), "retry", { now })?.syncStatus).toBe(
      "failed",
    );
  });
});
