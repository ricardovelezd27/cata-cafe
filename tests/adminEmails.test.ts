import { describe, expect, it } from "vitest";
import {
  matchesAiAdmin,
  matchesSuperAdmin,
  parseAiAdminEmails,
  parseSuperAdminEmail,
} from "@/lib/analytics/adminEmails";

describe("parseSuperAdminEmail", () => {
  it("trims and lowercases", () => {
    expect(parseSuperAdminEmail({ ANALYTICS_SUPER_ADMIN_EMAIL: "  Boss@Example.TEST " })).toBe("boss@example.test");
  });
  it("is null when unset or blank", () => {
    expect(parseSuperAdminEmail({})).toBeNull();
    expect(parseSuperAdminEmail({ ANALYTICS_SUPER_ADMIN_EMAIL: "" })).toBeNull();
    expect(parseSuperAdminEmail({ ANALYTICS_SUPER_ADMIN_EMAIL: "   " })).toBeNull();
  });
});

describe("parseSuperAdminEmail: exactly one valid address", () => {
  it("rejects a list, a non-address and inner spaces", () => {
    for (const bad of ["a@b.test,c@d.test", "a@b.test, c@d.test", "not-an-email", "a b@c.test", "a@b.test,c.d"]) {
      expect(parseSuperAdminEmail({ ANALYTICS_SUPER_ADMIN_EMAIL: bad })).toBeNull();
    }
  });
  it("accepts surrounding spaces and mixed case", () => {
    expect(parseSuperAdminEmail({ ANALYTICS_SUPER_ADMIN_EMAIL: "  a@b.test " })).toBe("a@b.test");
    expect(parseSuperAdminEmail({ ANALYTICS_SUPER_ADMIN_EMAIL: "A@B.Test" })).toBe("a@b.test");
  });
  it("nobody matches when the value is malformed", () => {
    expect(matchesSuperAdmin("a@b.test", { ANALYTICS_SUPER_ADMIN_EMAIL: "a@b.test,c@d.test" })).toBe(false);
  });
});

describe("matchesSuperAdmin", () => {
  const env = { ANALYTICS_SUPER_ADMIN_EMAIL: "Boss@example.test" };
  it("matches case-insensitively", () => {
    expect(matchesSuperAdmin("BOSS@example.test", env)).toBe(true);
    expect(matchesSuperAdmin(" boss@example.test ", env)).toBe(true);
    expect(matchesSuperAdmin("other@example.test", env)).toBe(false);
  });
  it("never matches empty, null or undefined", () => {
    for (const e of [env, { ANALYTICS_SUPER_ADMIN_EMAIL: "" }, {}]) {
      expect(matchesSuperAdmin("", e)).toBe(false);
      expect(matchesSuperAdmin("  ", e)).toBe(false);
      expect(matchesSuperAdmin(null, e)).toBe(false);
      expect(matchesSuperAdmin(undefined, e)).toBe(false);
    }
  });
  it("nobody is super-admin when the variable is missing or blank", () => {
    expect(matchesSuperAdmin("boss@example.test", {})).toBe(false);
    expect(matchesSuperAdmin("boss@example.test", { ANALYTICS_SUPER_ADMIN_EMAIL: "  " })).toBe(false);
  });
});

describe("AI-admin list", () => {
  it("parses a comma list, trimmed and lowercased, dropping blanks", () => {
    const env = { ANALYTICS_SUPER_ADMIN_EMAIL: "boss@example.test", ANALYTICS_AI_ADMIN_EMAILS: " Kim@Example.test, ,b@x.test," };
    expect(parseAiAdminEmails(env)).toEqual(["kim@example.test", "b@x.test"]);
    expect(matchesAiAdmin("KIM@example.test", env)).toBe(true);
    expect(matchesAiAdmin("boss@example.test", env)).toBe(false);
  });
  it("falls back to the super-admin when the list is unset or blank", () => {
    expect(parseAiAdminEmails({ ANALYTICS_SUPER_ADMIN_EMAIL: "Boss@example.test" })).toEqual(["boss@example.test"]);
    expect(
      parseAiAdminEmails({ ANALYTICS_SUPER_ADMIN_EMAIL: "boss@example.test", ANALYTICS_AI_ADMIN_EMAILS: " , " }),
    ).toEqual(["boss@example.test"]);
  });
  it("is empty with no list and no super-admin, and never matches empty values", () => {
    expect(parseAiAdminEmails({})).toEqual([]);
    expect(parseAiAdminEmails({ ANALYTICS_SUPER_ADMIN_EMAIL: " " })).toEqual([]);
    expect(matchesAiAdmin("anyone@example.test", {})).toBe(false);
    expect(matchesAiAdmin("", { ANALYTICS_AI_ADMIN_EMAILS: "a@x.test" })).toBe(false);
    expect(matchesAiAdmin(null, { ANALYTICS_AI_ADMIN_EMAILS: "a@x.test" })).toBe(false);
    expect(matchesAiAdmin(undefined, {})).toBe(false);
  });
});
