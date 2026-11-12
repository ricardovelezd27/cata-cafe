import { describe, expect, it, vi } from "vitest";
import { retryOnCodeCollision } from "@/lib/coffeeCode";

const codeCollision = () => Object.assign(new Error("dup"), { code: "P2002", meta: { target: ["code"] } });
const otherUnique = () => Object.assign(new Error("dup"), { code: "P2002", meta: { target: ["name"] } });

describe("retryOnCodeCollision", () => {
  it("returns the first success without retrying", async () => {
    const run = vi.fn().mockResolvedValue("ok");
    await expect(retryOnCodeCollision(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("retries the whole run on a code collision", async () => {
    const run = vi.fn().mockRejectedValueOnce(codeCollision()).mockRejectedValueOnce(codeCollision()).mockResolvedValue("ok");
    await expect(retryOnCodeCollision(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(3);
  });
  it("gives up after maxAttempts collisions", async () => {
    const run = vi.fn().mockRejectedValue(codeCollision());
    await expect(retryOnCodeCollision(run, 3)).rejects.toMatchObject({ code: "P2002" });
    expect(run).toHaveBeenCalledTimes(3);
  });
  it("rethrows any other error immediately", async () => {
    for (const err of [otherUnique(), new Error("boom")]) {
      const run = vi.fn().mockRejectedValue(err);
      await expect(retryOnCodeCollision(run)).rejects.toBe(err);
      expect(run).toHaveBeenCalledTimes(1);
    }
  });
});
