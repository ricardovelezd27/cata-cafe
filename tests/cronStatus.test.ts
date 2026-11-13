import { describe, expect, it } from "vitest";
import { cronStatus, passErrorCode } from "@/lib/cronPass";

describe("passErrorCode: code, then errorCode, then constructor name (never the message)", () => {
  it("prefers a string code", () => {
    expect(passErrorCode({ code: "P2024", errorCode: "x" })).toBe("P2024");
  });
  it("falls back to errorCode (Prisma connection errors)", () => {
    expect(passErrorCode({ errorCode: "P1001" })).toBe("P1001");
    expect(passErrorCode({ code: 5, errorCode: "P1001" })).toBe("P1001");
  });
  it("falls back to the constructor name, never the message", () => {
    class PrismaClientInitializationError extends Error {}
    expect(passErrorCode(new PrismaClientInitializationError("password=secret"))).toBe("PrismaClientInitializationError");
    expect(passErrorCode(new Error("secret"))).toBe("Error");
  });
  it("unknown for a non-object", () => {
    expect(passErrorCode(null)).toBe("unknown");
    expect(passErrorCode("boom")).toBe("unknown");
  });
});

describe("cronStatus", () => {
  const none = { closeFailed: false, repairFailed: false, remindersFailed: false, idlePassFailed: false, reconcileFailed: false };
  it("all passes fine: 200 and ok", () => {
    expect(cronStatus(none)).toEqual({ ok: true, httpStatus: 200 });
  });
  it("a failed deadline-close or repair pass is red: 500 and ok false", () => {
    expect(cronStatus({ ...none, closeFailed: true })).toEqual({ ok: false, httpStatus: 500 });
    expect(cronStatus({ ...none, repairFailed: true })).toEqual({ ok: false, httpStatus: 500 });
  });
  it("best-effort passes (reminders, idle, reconcile) keep 200", () => {
    expect(cronStatus({ ...none, remindersFailed: true, idlePassFailed: true, reconcileFailed: true })).toEqual({ ok: true, httpStatus: 200 });
  });
});
