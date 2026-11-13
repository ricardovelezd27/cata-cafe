// S10 WP8b item 1: the claim re-key against the real store module, with an
// in-memory localforage standing in for IndexedDB. Proves the sequence the
// reviewer described: edits typed (latched) under the anonymous id -> re-key
// -> they are in the account's blob, and the first later save does not replace
// the module with a stale copy. Nothing here touches a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map<string, unknown>();
vi.mock("localforage", () => ({
  default: {
    createInstance: () => ({
      getItem: async (k: string) => (mem.has(k) ? structuredClone(mem.get(k)) : null),
      setItem: async (k: string, v: unknown) => {
        mem.set(k, structuredClone(v));
        return v;
      },
      removeItem: async (k: string) => {
        mem.delete(k);
      },
      keys: async () => [...mem.keys()],
    }),
  },
}));
vi.mock("@/lib/platform/storage", () => ({ requestPersistentStorage: async () => {} }));

import { loadSession, mergeModuleData, rekeyUserBlobs, sessionKey } from "@/lib/offline/store";
import { rekeyBlob } from "@/lib/offline/status";
import type { OfflineSessionBlob } from "@/lib/offline/types";

const SEED = { format: "affective", cupsPerSample: 5 };
const ANON = "anon-1";
const ACCOUNT = "acct-1";

beforeEach(() => {
  mem.clear();
  (globalThis as unknown as { window: object }).window = {};
});

const write = (user: string, data: Record<string, unknown>) =>
  mergeModuleData("s1", user, "sample1", "Muestra A", "affective", data, SEED);

describe("claim re-key at store level", () => {
  it("latched edits under the anonymous id end up in the account blob and are not overwritten by the next save", async () => {
    await write(ANON, { a: 1 });
    await write(ANON, { a: 2, typedWhileLatched: true }); // keeps typing after the latch
    expect(await rekeyUserBlobs(ANON, ACCOUNT)).toBe(1);

    expect(await loadSession("s1", ANON)).toBeNull(); // old key gone
    const moved = await loadSession("s1", ACCOUNT);
    expect(moved?.userId).toBe(ACCOUNT);
    expect(moved?.samples.sample1.modules.affective?.data).toEqual({ a: 2, typedWhileLatched: true });
    expect(moved?.samples.sample1.modules.affective?.syncStatus).toBe("pending");

    // The reloaded form hydrates from the moved blob, so its next save carries
    // the latched edit forward (a whole-module replace of the SAME data + change).
    await write(ACCOUNT, { a: 2, typedWhileLatched: true, next: 3 });
    const after = await loadSession("s1", ACCOUNT);
    expect(after?.samples.sample1.modules.affective?.data).toEqual({ a: 2, typedWhileLatched: true, next: 3 });
  });

  it("is idempotent: a second re-key moves nothing and changes nothing", async () => {
    await write(ANON, { a: 1 });
    await rekeyUserBlobs(ANON, ACCOUNT);
    const before = await loadSession("s1", ACCOUNT);
    expect(await rekeyUserBlobs(ANON, ACCOUNT)).toBe(0);
    expect(await loadSession("s1", ACCOUNT)).toEqual(before);
  });

  it("collision: the newer module wins whichever side it is on, never a blind overwrite", async () => {
    // account already has an older affective; anon has a newer one -> anon wins
    const t = Date.now();
    const base = (user: string, at: number, data: Record<string, unknown>): OfflineSessionBlob => ({
      sessionId: "s1",
      userId: user,
      updatedAt: at,
      format: "affective",
      cupsPerSample: 5,
      samples: { sample1: { label: "Muestra A", modules: { affective: { data, syncStatus: "pending", updatedAt: at } } } },
    });
    mem.set(sessionKey("s1", ACCOUNT), base(ACCOUNT, t - 5000, { who: "account-old" }));
    mem.set(sessionKey("s1", ANON), base(ANON, t, { who: "anon-new" }));
    await rekeyUserBlobs(ANON, ACCOUNT);
    expect((await loadSession("s1", ACCOUNT))?.samples.sample1.modules.affective?.data).toEqual({ who: "anon-new" });

    // reverse: account newer than anon -> account kept
    mem.clear();
    mem.set(sessionKey("s1", ACCOUNT), base(ACCOUNT, t, { who: "account-new" }));
    mem.set(sessionKey("s1", ANON), base(ANON, t - 5000, { who: "anon-old" }));
    await rekeyUserBlobs(ANON, ACCOUNT);
    expect((await loadSession("s1", ACCOUNT))?.samples.sample1.modules.affective?.data).toEqual({ who: "account-new" });
  });

  it("modules that exist on only one side are all kept", () => {
    const mk = (user: string, key: "affective" | "descriptive"): OfflineSessionBlob => ({
      sessionId: "s1",
      userId: user,
      updatedAt: 1,
      format: "combined",
      cupsPerSample: 5,
      samples: { sample1: { label: "A", modules: { [key]: { data: { k: key }, syncStatus: "pending", updatedAt: 1 } } } },
    });
    const out = rekeyBlob(mk(ANON, "descriptive"), ACCOUNT, mk(ACCOUNT, "affective"));
    expect(Object.keys(out.samples.sample1.modules).sort()).toEqual(["affective", "descriptive"]);
  });

  it("equal timestamps keep the account's copy (documented tie rule), and the other is not silently re-timed", () => {
    const mk = (user: string, v: number): OfflineSessionBlob => ({
      sessionId: "s1",
      userId: user,
      updatedAt: 5,
      format: "affective",
      cupsPerSample: 5,
      samples: { sample1: { label: "A", modules: { affective: { data: { v }, syncStatus: "pending", updatedAt: 5 } } } },
    });
    expect(rekeyBlob(mk(ANON, 1), ACCOUNT, mk(ACCOUNT, 2)).samples.sample1.modules.affective?.data).toEqual({ v: 2 });
  });
});
