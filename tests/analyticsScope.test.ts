import { describe, expect, it } from "vitest";
import { scopeFor } from "@/lib/analytics/scope";

describe("scopeFor", () => {
  it("super-admin sees the platform", () => {
    expect(scopeFor({ userId: "u1", isSuperAdmin: true })).toEqual({ kind: "platform" });
  });
  it("AI admin sees only their own data", () => {
    expect(scopeFor({ userId: "u2", isSuperAdmin: false })).toEqual({ kind: "user", userId: "u2" });
  });
  it("flagged user sees only their own data", () => {
    expect(scopeFor({ userId: "u3", isSuperAdmin: false })).toEqual({ kind: "user", userId: "u3" });
  });
});
