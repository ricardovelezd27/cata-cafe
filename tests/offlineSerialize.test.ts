import { describe, expect, it } from "vitest";
import { createKeyedQueue } from "@/lib/offline/serialize";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("createKeyedQueue", () => {
  it("never interleaves read-modify-write tasks on the same key", async () => {
    const serialize = createKeyedQueue();
    let stored = 0;
    const rmw = (add: number) =>
      serialize("k", async () => {
        const read = stored;
        await tick(); // a concurrent writer would land here
        stored = read + add;
      });
    await Promise.all([rmw(1), rmw(10), rmw(100)]);
    expect(stored).toBe(111);
  });

  it("runs different keys independently", async () => {
    const serialize = createKeyedQueue();
    const order: string[] = [];
    const slow = serialize("a", async () => {
      await tick();
      await tick();
      order.push("a");
    });
    const fast = serialize("b", async () => {
      order.push("b");
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["b", "a"]);
  });

  it("a failing task rejects only itself and does not break the chain", async () => {
    const serialize = createKeyedQueue();
    const bad = serialize("k", async () => {
      throw new Error("boom");
    });
    const good = serialize("k", async () => "ok");
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("ok");
  });
});
