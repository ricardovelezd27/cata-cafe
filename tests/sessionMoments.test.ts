import { describe, expect, it } from "vitest";
import {
  clearMomentSeen,
  clearMomentsForDevice,
  hasSeenMoment,
  markMomentSeen,
  seenMomentValue,
  sessionMomentKey,
  type MomentStorage,
} from "@/lib/sessionMoments";

function memStorage(): MomentStorage & Storage {
  const map = new Map<string, string>();
  const s = {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  return s as unknown as MomentStorage & Storage;
}

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

describe("session moments seen-set (v3: per user, value = what was shown)", () => {
  it("keys are cata_moment_<kind>_<sessionId>_<userId>", () => {
    expect(sessionMomentKey("warmup", "s1", "u1")).toBe("cata_moment_warmup_s1_u1");
    expect(sessionMomentKey("reveal", "s1", "u1")).toBe("cata_moment_reveal_s1_u1");
  });

  it("is per kind, per session, per user and per value", () => {
    const s = memStorage();
    expect(hasSeenMoment("warmup", "s1", "u1", "eyes", s)).toBe(false);
    markMomentSeen("warmup", "s1", "u1", "eyes", s);
    expect(hasSeenMoment("warmup", "s1", "u1", "eyes", s)).toBe(true);
    expect(hasSeenMoment("warmup", "s1", "u1", "arm-raise", s)).toBe(false); // exercise changed → re-armed
    expect(hasSeenMoment("warmup", "s1", "u2", "eyes", s)).toBe(false); // shared tablet, other cupper
    expect(hasSeenMoment("warmup", "s2", "u1", "eyes", s)).toBe(false);
    expect(hasSeenMoment("reveal", "s1", "u1", "eyes", s)).toBe(false);
    expect(seenMomentValue("warmup", "s1", "u1", s)).toBe("eyes");
    clearMomentSeen("warmup", "s1", "u1", s);
    expect(hasSeenMoment("warmup", "s1", "u1", "eyes", s)).toBe(false);
  });

  it("ignores a pre-v3 key (no user, timestamp value) and removes it on write", () => {
    const s = memStorage();
    s.setItem("cata_moment_warmup_s1", "1700000000000");
    expect(hasSeenMoment("warmup", "s1", "u1", "eyes", s)).toBe(false);
    markMomentSeen("warmup", "s1", "u1", "eyes", s);
    expect(s.getItem("cata_moment_warmup_s1")).toBeNull();
    expect(s.getItem("cata_moment_warmup_s1_u1")).toBe("eyes");
  });

  it("falls back to the next tier when a storage throws, and always to memory", () => {
    const session = memStorage();
    markMomentSeen("warmup", "s1", "u1", "eyes", [throwing, session]);
    expect(session.getItem("cata_moment_warmup_s1_u1")).toBe("eyes");
    expect(hasSeenMoment("warmup", "s1", "u1", "eyes", [throwing, session])).toBe(true);
    // Every tier blocked: the in-memory tier still remembers within the page.
    expect(() => markMomentSeen("warmup", "s9", "u1", "eyes", [throwing])).not.toThrow();
    expect(hasSeenMoment("warmup", "s9", "u1", "eyes", [throwing])).toBe(true);
    expect(hasSeenMoment("warmup", "s9", "u1", "eyes", null)).toBe(true);
    expect(() => clearMomentSeen("warmup", "s9", "u1", [throwing])).not.toThrow();
    expect(hasSeenMoment("warmup", "s9", "u1", "eyes", null)).toBe(false);
  });

  it("clearMomentsForDevice removes only cata_moment_* keys from every tier", () => {
    const s = memStorage();
    s.setItem("cata_moment_warmup_s1_u1", "eyes");
    s.setItem("cata_moment_reveal_s1_u2", "1");
    s.setItem("cata_warmup_sound", "on");
    markMomentSeen("warmup", "s7", "u3", "eyes", [s]);
    clearMomentsForDevice([s]);
    expect(s.getItem("cata_moment_warmup_s1_u1")).toBeNull();
    expect(s.getItem("cata_moment_reveal_s1_u2")).toBeNull();
    expect(s.getItem("cata_warmup_sound")).toBe("on");
    expect(hasSeenMoment("warmup", "s7", "u3", "eyes", null)).toBe(false);
  });
});
