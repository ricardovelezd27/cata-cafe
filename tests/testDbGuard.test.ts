import { describe, expect, it } from "vitest";
import { assertSafeTestDatabaseUrl } from "./db/support/guard";

describe("test-db guard (audit D-05)", () => {
  it("accepts a local cata_test_ database", () => {
    expect(
      assertSafeTestDatabaseUrl("postgresql://postgres:pw@127.0.0.1:54329/cata_test_ab12").hostname,
    ).toBe("127.0.0.1");
    expect(() =>
      assertSafeTestDatabaseUrl("postgres://u:p@localhost:5432/cata_test_x?schema=public"),
    ).not.toThrow();
  });

  it.each([
    ["a hosted Supabase host", "postgresql://u:p@db.abcdefgh.supabase.co:5432/cata_test_x"],
    ["a pooler host", "postgresql://u:p@aws-0-eu.pooler.supabase.com:6543/cata_test_x"],
    ["a lookalike host", "postgresql://u:p@localhost.evil.com:5432/cata_test_x"],
    ["a userinfo trick", "postgresql://127.0.0.1:x@evil.com:5432/cata_test_x"],
    ["a non-test database", "postgresql://u:p@127.0.0.1:5432/postgres"],
    ["a prefix-less name", "postgresql://u:p@127.0.0.1:5432/prod_cata_test_x"],
    ["no database", "postgresql://u:p@127.0.0.1:5432"],
    ["a non-postgres scheme", "http://127.0.0.1/cata_test_x"],
    ["an IPv6 loopback (not whitelisted)", "postgresql://u:p@[::1]:5432/cata_test_x"],
  ])("refuses %s", (_label, url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).toThrow(/test-db guard/);
  });

  it("refuses empty or garbage input", () => {
    expect(() => assertSafeTestDatabaseUrl(undefined)).toThrow(/guard/);
    expect(() => assertSafeTestDatabaseUrl("")).toThrow(/guard/);
    expect(() => assertSafeTestDatabaseUrl("not a url")).toThrow(/guard/);
  });
});
