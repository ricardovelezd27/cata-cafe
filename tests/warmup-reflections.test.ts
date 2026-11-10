import { describe, expect, it } from "vitest";
import { purgeLegacyReflections, type KeyedStorage } from "@/lib/warmup/reflections";

function fakeStorage(keys: string[]): KeyedStorage & { keys: () => string[] } {
  const store = new Set(keys);
  return {
    get length() {
      return store.size;
    },
    key: (i) => Array.from(store)[i] ?? null,
    removeItem: (k) => void store.delete(k),
    keys: () => Array.from(store),
  };
}

describe("purgeLegacyReflections", () => {
  it("removes every cata_warmup_reflections_* key and nothing else", () => {
    const st = fakeStorage([
      "cata_warmup_reflections_eyes",
      "cata_warmup_reflections_arm-raise",
      "cata_warmup_sound",
      "cata_moment_warmup_s1_u1",
    ]);
    expect(purgeLegacyReflections(st)).toBe(2);
    expect(st.keys()).toEqual(["cata_warmup_sound", "cata_moment_warmup_s1_u1"]);
  });
  it("is a no-op without storage or when storage throws", () => {
    expect(purgeLegacyReflections(null)).toBe(0);
    const boom = {
      get length(): number {
        throw new Error("blocked");
      },
      key: () => null,
      removeItem: () => {},
    };
    expect(purgeLegacyReflections(boom)).toBe(0);
  });
});
