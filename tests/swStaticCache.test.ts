import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// public/sw.js is a plain script (no exports). Evaluate it against stubbed
// globals and pull out the cache-trim rule, so the eviction behaviour is
// exercised as written (S8-28 C-04).
function loadSw() {
  const src = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  const deleted: string[] = [];
  let keys: string[] = [];
  const cache = {
    keys: async () => keys.map((k) => ({ url: k })),
    delete: async (req: { url: string }) => {
      deleted.push(req.url);
      keys = keys.filter((k) => k !== req.url);
      return true;
    },
  };
  const stubs = {
    self: { addEventListener: () => undefined, location: { origin: "https://x.test" } },
    caches: { open: async () => cache },
  };
  const factory = new Function(
    "self",
    "caches",
    `${src}\nreturn { trimCache, MAX_STATIC_ENTRIES };`,
  );
  const sw = factory(stubs.self, stubs.caches) as {
    trimCache: (name: string, max: number) => Promise<void>;
    MAX_STATIC_ENTRIES: number;
  };
  return { sw, setKeys: (k: string[]) => (keys = k), deleted, getKeys: () => keys };
}

describe("service worker static cache cap", () => {
  it("is large enough for one SPA session of route chunks (above the old 120)", () => {
    const { sw } = loadSw();
    expect(sw.MAX_STATIC_ENTRIES).toBeGreaterThan(120);
  });

  it("trims to the cap, evicting the oldest (least recently used) first", async () => {
    const { sw, setKeys, deleted, getKeys } = loadSw();
    const max = sw.MAX_STATIC_ENTRIES;
    setKeys(Array.from({ length: max + 3 }, (_, i) => `k${i}`));
    await sw.trimCache("c", max);
    expect(deleted).toEqual(["k0", "k1", "k2"]);
    expect(getKeys()).toHaveLength(max);
  });

  it("does nothing at or under the cap", async () => {
    const { sw, setKeys, deleted } = loadSw();
    setKeys(Array.from({ length: sw.MAX_STATIC_ENTRIES }, (_, i) => `k${i}`));
    await sw.trimCache("c", sw.MAX_STATIC_ENTRIES);
    expect(deleted).toEqual([]);
  });
});
