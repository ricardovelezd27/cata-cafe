import { describe, expect, it } from "vitest";
import {
  PERSIST_KEY,
  STALE_DRAFT_MS,
  getPersistState,
  requestPersistentStorage,
  shouldWarnStaleDraft,
} from "@/lib/platform/storage";

function memLs() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("requestPersistentStorage", () => {
  it("asks once, records the outcome, then reuses it", async () => {
    const ls = memLs();
    let calls = 0;
    const env = { persist: async () => (calls++, true), ls, now: () => 1000 };
    expect(await requestPersistentStorage(env)).toEqual({ outcome: "granted", at: 1000 });
    expect(await requestPersistentStorage(env)).toEqual({ outcome: "granted", at: 1000 });
    expect(calls).toBe(1);
    expect(JSON.parse(ls.m.get(PERSIST_KEY)!)).toEqual({ outcome: "granted", at: 1000 });
    expect(getPersistState(env)?.outcome).toBe("granted");
  });
  it("records denied, unsupported and error without throwing", async () => {
    expect((await requestPersistentStorage({ persist: async () => false, ls: memLs(), now: () => 1 }))?.outcome).toBe("denied");
    expect((await requestPersistentStorage({ ls: memLs(), now: () => 1 }))?.outcome).toBe("unsupported");
    expect(
      (await requestPersistentStorage({ persist: async () => { throw new Error("x"); }, ls: memLs(), now: () => 1 }))?.outcome,
    ).toBe("error");
  });
  it("asks again after 24 h when denied, not before", async () => {
    const ls = memLs();
    let calls = 0;
    let t = 1000;
    const env = { persist: async () => (calls++, calls >= 2), ls, now: () => t };
    expect((await requestPersistentStorage(env))?.outcome).toBe("denied");
    t = 1000 + 24 * 60 * 60 * 1000 - 1;
    expect((await requestPersistentStorage(env))?.outcome).toBe("denied");
    expect(calls).toBe(1);
    t = 1000 + 24 * 60 * 60 * 1000;
    expect(await requestPersistentStorage(env)).toEqual({ outcome: "granted", at: t });
    expect(calls).toBe(2);
  });
  it("never asks again once granted", async () => {
    const ls = memLs();
    let calls = 0;
    let t = 0;
    const env = { persist: async () => (calls++, true), ls, now: () => t };
    await requestPersistentStorage(env);
    t = 100 * 24 * 60 * 60 * 1000;
    await requestPersistentStorage(env);
    expect(calls).toBe(1);
  });
  it("survives a missing or throwing localStorage", async () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect((await requestPersistentStorage({ persist: async () => true, ls: bad, now: () => 5 }))?.outcome).toBe("granted");
    expect(getPersistState({ ls: null })).toBeNull();
    expect(getPersistState({ ls: bad })).toBeNull();
  });
});

describe("shouldWarnStaleDraft", () => {
  const now = 10 * STALE_DRAFT_MS;
  it("warns past 3 days when not installed", () => {
    expect(shouldWarnStaleDraft({ oldestPendingAt: now - STALE_DRAFT_MS - 1, now, standalone: false })).toBe(true);
    expect(shouldWarnStaleDraft({ oldestPendingAt: now - STALE_DRAFT_MS + 1000, now, standalone: false })).toBe(false);
  });
  it("stays quiet when installed, persisted or nothing pending", () => {
    const old = now - 2 * STALE_DRAFT_MS;
    expect(shouldWarnStaleDraft({ oldestPendingAt: old, now, standalone: true })).toBe(false);
    expect(shouldWarnStaleDraft({ oldestPendingAt: old, now, standalone: false, persist: { outcome: "granted", at: 1 } })).toBe(false);
    expect(shouldWarnStaleDraft({ oldestPendingAt: old, now, standalone: false, persist: { outcome: "denied", at: 1 } })).toBe(true);
    expect(shouldWarnStaleDraft({ oldestPendingAt: null, now, standalone: false })).toBe(false);
  });
});
