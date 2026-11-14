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
    `${src}\nreturn { trimCache, MAX_STATIC_ENTRIES, isNeverCachedPage, SW_VERSION, isWarmupVoice, VOICE_CACHE };`,
  );
  const sw = factory(stubs.self, stubs.caches) as {
    trimCache: (name: string, max: number) => Promise<void>;
    MAX_STATIC_ENTRIES: number;
    isNeverCachedPage: (pathname: string) => boolean;
    SW_VERSION: string;
    isWarmupVoice: (pathname: string) => boolean;
    VOICE_CACHE: string;
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

describe("service worker never-cached pages (S10 WP7, F2)", () => {
  it("keeps insights, profile and the warm-up exercise pages out of the page/RSC caches", () => {
    const { sw } = loadSw();
    for (const p of [
      "/es/app/insights", "/en/app/insights/users", "/es/app/profile", "/es/app/profile/history",
      "/es/app/warmup/ojos", "/en/app/warmup/brazo-lento", "/es/app/warmup/dev-player", "/app/warmup/cabeza",
    ]) expect(sw.isNeverCachedPage(p), p).toBe(true);
    for (const p of ["/es/app/warmup", "/en/app/warmup/", "/es/app/sessions", "/es/app/coffees/x", "/es/app/profiles"]) {
      expect(sw.isNeverCachedPage(p), p).toBe(false);
    }
  });
  it("the cache version was bumped for the new rule", () => {
    expect(loadSw().sw.SW_VERSION).toBe("v5");
  });
});

describe("service worker: the warm-up's recorded voice", () => {
  it("recognises the voice files and nothing else", () => {
    const { sw } = loadSw();
    for (const p of ["/warmup/voice/es-dora-419/618384ff19aeb32b.mp3", "/warmup/voice/en-heart/d315c82af572615e.mp3"]) {
      expect(sw.isWarmupVoice(p), p).toBe(true);
    }
    for (const p of ["/warmup/dev/voice-reference.mp3", "/warmup/voice/es-dora-419/", "/es/app/warmup/ojos", "/warmup/voice/es-dora-419/x.json", "/api/warmup/voice/a/b.mp3"]) {
      expect(sw.isWarmupVoice(p), p).toBe(false);
    }
  });
  it("keeps the voice in its own cache, with its own version, and activate does not drop it", () => {
    const { sw } = loadSw();
    expect(sw.VOICE_CACHE).toBe("cata-warmup-voice-v1");
    expect(sw.VOICE_CACHE).not.toContain(sw.SW_VERSION);
    const src = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
    expect(src).toMatch(/key !== RSC_CACHE && key !== VOICE_CACHE/);
  });
});
