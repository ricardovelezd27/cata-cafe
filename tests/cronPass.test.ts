import { describe, expect, it, vi } from "vitest";
import { passErrorCode, runPass } from "@/lib/cronPass";

describe("runPass (S10 leftovers B3)", () => {
  it("returns the value of a pass that succeeds and logs nothing", async () => {
    const log = vi.fn();
    expect(await runPass("p", async () => 7, log)).toEqual({ ok: true, value: 7 });
    expect(log).not.toHaveBeenCalled();
  });

  it("a pass that throws is reported, logged with a code only, and does not reject", async () => {
    const log = vi.fn();
    const r = await runPass(
      "cron.closeExpired",
      async () => {
        throw Object.assign(new Error("secret detail"), { code: "P2024" });
      },
      log,
    );
    expect(r).toEqual({ ok: false, code: "P2024" });
    expect(log).toHaveBeenCalledWith("cron.closeExpired", "P2024");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret detail");
  });

  it("later passes still run after a failed one, in order", async () => {
    const order: string[] = [];
    const log = () => {};
    const a = await runPass(
      "close",
      async () => {
        order.push("close");
        throw new Error("x");
      },
      log,
    );
    const b = await runPass("repair", async () => (order.push("repair"), 1), log);
    const c = await runPass("purge", async () => (order.push("purge"), 2), log);
    expect(order).toEqual(["close", "repair", "purge"]);
    expect([a.ok, b.ok, c.ok]).toEqual([false, true, true]);
  });

  it("a failing logger cannot take the run down", async () => {
    const r = await runPass(
      "p",
      async () => {
        throw new Error("x");
      },
      () => {
        throw new Error("log down");
      },
    );
    expect(r).toEqual({ ok: false, code: "Error" });
  });

  it("passErrorCode: a string code, else unknown", () => {
    expect(passErrorCode({ code: "P2002" })).toBe("P2002");
    expect(passErrorCode({ code: 5 })).toBe("unknown");
    expect(passErrorCode(null)).toBe("unknown");
  });
});
