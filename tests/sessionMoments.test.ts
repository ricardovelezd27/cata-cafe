import { describe, expect, it } from "vitest";
import {
  clearMomentSeen,
  hasSeenMoment,
  markMomentSeen,
  sessionMomentKey,
  type MomentStorage,
} from "@/lib/sessionMoments";

function memStorage(): MomentStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe("session moments seen-set", () => {
  it("keys are cata_moment_<kind>_<sessionId>", () => {
    expect(sessionMomentKey("warmup", "abc")).toBe("cata_moment_warmup_abc");
    expect(sessionMomentKey("reveal", "abc")).toBe("cata_moment_reveal_abc");
  });

  it("is per kind and per session", () => {
    const s = memStorage();
    expect(hasSeenMoment("warmup", "s1", s)).toBe(false);
    markMomentSeen("warmup", "s1", s);
    expect(hasSeenMoment("warmup", "s1", s)).toBe(true);
    expect(hasSeenMoment("warmup", "s2", s)).toBe(false);
    expect(hasSeenMoment("reveal", "s1", s)).toBe(false);
    clearMomentSeen("warmup", "s1", s);
    expect(hasSeenMoment("warmup", "s1", s)).toBe(false);
  });

  it("tolerates a missing or throwing storage", () => {
    expect(hasSeenMoment("warmup", "s1", null)).toBe(false);
    expect(() => markMomentSeen("warmup", "s1", null)).not.toThrow();
    const throwing: MomentStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(hasSeenMoment("warmup", "s1", throwing)).toBe(false);
    expect(() => markMomentSeen("warmup", "s1", throwing)).not.toThrow();
    expect(() => clearMomentSeen("warmup", "s1", throwing)).not.toThrow();
  });
});
