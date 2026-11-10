import { describe, expect, it } from "vitest";
import { directoryEmail, scopeFor } from "@/lib/analytics/scope";

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

describe("directoryEmail (Users directory payload)", () => {
  it("super-admin receives the raw address", () => {
    expect(directoryEmail("jane@example.com", true)).toBe("jane@example.com");
  });
  it("AI admin / flagged user never receive the raw address", () => {
    const out = directoryEmail("jane@example.com", false);
    expect(out).toBe("j***@example.com");
    expect(out).not.toContain("jane");
  });
  it("keeps null as null", () => {
    expect(directoryEmail(null, false)).toBeNull();
    expect(directoryEmail(null, true)).toBeNull();
  });
});
