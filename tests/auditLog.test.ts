import { afterEach, describe, expect, it, vi } from "vitest";
import { auditFields, auditLog } from "@/lib/analytics/audit";

afterEach(() => vi.restoreAllMocks());

describe("audit log shape", () => {
  it("carries action, actor id and count, nothing else", () => {
    expect(auditFields("exportRegisteredUsersCsv", "u1", { count: 42 })).toEqual({
      where: "audit",
      action: "exportRegisteredUsersCsv",
      actorId: "u1",
      count: 42,
    });
  });
  it("carries the target id for grants", () => {
    expect(auditFields("grantAnalyticsAccess", "u1", { targetId: "u2" })).toEqual({
      where: "audit",
      action: "grantAnalyticsAccess",
      actorId: "u1",
      targetId: "u2",
    });
  });
  it("emits one JSON line with where=audit and no email", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    auditLog("listAnalyticsUsers", "u1", { count: 7 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ where: "audit", action: "listAnalyticsUsers", actorId: "u1", count: 7 });
    expect(line).not.toMatch(/@/);
  });
});
