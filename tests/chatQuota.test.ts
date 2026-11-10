import { describe, expect, it } from "vitest";
import { releaseQuestionSlot, reserveQuestionSlot, type ChatQuotaStore } from "@/lib/ai/chatQuota";

// In-memory store with the same semantics as the SQL: the conditional
// increment is atomic (each call checks and bumps without an await between).
function fakeStore(initial = 0): ChatQuotaStore & { count: () => number } {
  let n = initial;
  return {
    async ensureRow() {
      await Promise.resolve();
    },
    async tryIncrement(limit) {
      await Promise.resolve();
      if (n < limit) {
        n += 1;
        return 1;
      }
      return 0;
    },
    async decrement() {
      await Promise.resolve();
      if (n > 0) n -= 1;
    },
    count: () => n,
  };
}

describe("chat quota slot", () => {
  it("30 parallel questions reserve at most 25 slots", async () => {
    const store = fakeStore();
    const results = await Promise.all(
      Array.from({ length: 30 }, () => reserveQuestionSlot(store, 25)),
    );
    expect(results.filter(Boolean)).toHaveLength(25);
    expect(store.count()).toBe(25);
  });

  it("a full day refuses without changing the count", async () => {
    const store = fakeStore(25);
    expect(await reserveQuestionSlot(store, 25)).toBe(false);
    expect(store.count()).toBe(25);
  });

  it("releasing after a failure before any success restores the slot", async () => {
    const store = fakeStore(24);
    expect(await reserveQuestionSlot(store, 25)).toBe(true);
    await releaseQuestionSlot(store);
    expect(store.count()).toBe(24);
    expect(await reserveQuestionSlot(store, 25)).toBe(true);
  });

  it("release never goes below zero", async () => {
    const store = fakeStore(0);
    await releaseQuestionSlot(store);
    expect(store.count()).toBe(0);
  });
});
