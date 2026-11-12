import { describe, expect, it, vi } from "vitest";
import { isCoffeeCodeCollision, retryOnCodeCollision } from "@/lib/coffeeCode";

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

// The shape Prisma 7 + @prisma/adapter-pg really produces: no `meta.target`,
// the column sits under meta.driverAdapterError.cause.constraint.fields.
const adapterCollision = (fields: string[]) =>
  Object.assign(new Error("dup"), {
    code: "P2002",
    meta: { driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { fields } } } },
  });

describe("isCoffeeCodeCollision with the pg driver adapter's error shape", () => {
  it("recognises a collision on code", () => {
    expect(isCoffeeCodeCollision(adapterCollision(["code"]))).toBe(true);
    expect(isCoffeeCodeCollision(adapterCollision(['"code"']))).toBe(true);
  });
  it("does not treat another column as a code collision", () => {
    expect(isCoffeeCodeCollision(adapterCollision(["name"]))).toBe(false);
    expect(isCoffeeCodeCollision(adapterCollision(["sessionId", "position"]))).toBe(false);
    expect(isCoffeeCodeCollision(adapterCollision(["coffeeCodeOther"]))).toBe(false);
  });
  it("still needs P2002", () => {
    expect(isCoffeeCodeCollision({ code: "P2003", meta: { driverAdapterError: { cause: { constraint: { fields: ["code"] } } } } })).toBe(false);
    expect(isCoffeeCodeCollision(null)).toBe(false);
  });
  it("retries the whole run on the adapter shape too", async () => {
    const run = vi.fn().mockRejectedValueOnce(adapterCollision(["code"])).mockResolvedValue("ok");
    await expect(retryOnCodeCollision(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });
});
