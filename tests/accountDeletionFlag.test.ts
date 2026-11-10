import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

import { isAccountDeletionEnabled, parseFlag } from "@/lib/features";

// S8-22 A-01: account deletion ships disabled.
describe("feature flag parse", () => {
  it("is on only for the exact string 1", () => {
    expect(parseFlag("1")).toBe(true);
    for (const v of [undefined, "", "0", "true", "yes", " 1", "1 ", "on"]) {
      expect(parseFlag(v)).toBe(false);
    }
  });
  it("account deletion defaults to off", () => {
    expect(isAccountDeletionEnabled({})).toBe(false);
    expect(isAccountDeletionEnabled({ ACCOUNT_DELETION_ENABLED: "1" })).toBe(true);
  });
});

describe("account actions check the flag first", () => {
  const src = readFileSync("app/actions/account.ts", "utf8");
  for (const name of ["getMyAccountDeletionImpact", "deleteAccount"]) {
    it(`${name} refuses before requireUser`, () => {
      const start = src.indexOf(`run("${name}"`);
      expect(start).toBeGreaterThan(-1);
      const body = src.slice(start);
      const flag = body.indexOf("isAccountDeletionEnabled()");
      const user = body.indexOf("requireUser(");
      expect(flag).toBeGreaterThan(-1);
      expect(flag).toBeLessThan(user);
      expect(body.slice(flag, user)).toContain("not_found_or_forbidden");
    });
  }
  it("the profile page renders the dialog only when enabled", () => {
    const page = readFileSync("app/[locale]/app/profile/page.tsx", "utf8");
    const gate = page.indexOf("isAccountDeletionEnabled() &&");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(page.indexOf("<DeleteAccountDialog"));
  });
});
