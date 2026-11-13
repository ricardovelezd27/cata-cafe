import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { completedEmailChange, EMAIL_CHANGE_FROM_KEY } from "@/lib/emailChangeRules";

const meta = (from: unknown) => ({ [EMAIL_CHANGE_FROM_KEY]: from });

describe("completedEmailChange", () => {
  it("returns the pair once the change is complete (no pending address)", () => {
    expect(completedEmailChange({ email: "New@Example.test", new_email: "", user_metadata: meta("Old@Example.test ") })).toEqual({
      from: "old@example.test",
      to: "new@example.test",
    });
    expect(completedEmailChange({ email: "n@e.test", user_metadata: meta("o@e.test") })).toEqual({ from: "o@e.test", to: "n@e.test" });
  });
  it("is null while an address is still pending (the first of two confirmations)", () => {
    expect(completedEmailChange({ email: "o@e.test", new_email: "n@e.test", user_metadata: meta("o@e.test") })).toBeNull();
  });
  it("is null without a recorded previous address, or when it equals the current one", () => {
    expect(completedEmailChange({ email: "n@e.test", user_metadata: {} })).toBeNull();
    expect(completedEmailChange({ email: "n@e.test", user_metadata: meta(null) })).toBeNull();
    expect(completedEmailChange({ email: "n@e.test", user_metadata: meta("  ") })).toBeNull();
    expect(completedEmailChange({ email: "n@e.test", user_metadata: meta(42) })).toBeNull();
    expect(completedEmailChange({ email: "N@E.test", user_metadata: meta("n@e.test") })).toBeNull();
  });
  it("is null without a user or an address", () => {
    expect(completedEmailChange(null)).toBeNull();
    expect(completedEmailChange(undefined)).toBeNull();
    expect(completedEmailChange({ email: null, user_metadata: meta("o@e.test") })).toBeNull();
  });
});

describe("wiring in app/actions/auth.ts", () => {
  const auth = readFileSync("app/actions/auth.ts", "utf8");
  const bodyOf = (name: string) => {
    const i = auth.indexOf(`run("${name}"`);
    const next = auth.indexOf("\nexport async function ", i + 1);
    return auth.slice(i, next === -1 ? undefined : next);
  };
  it("requestEmailChange records the old address in the account's own metadata", () => {
    expect(bodyOf("requestEmailChange")).toContain("data: { [EMAIL_CHANGE_FROM_KEY]:");
  });
  it("confirmEmailToken moves the reservation only for email_change, right after the token is verified", () => {
    const body = bodyOf("confirmEmailToken");
    expect(body).toContain('if (type === "email_change") await moveReservationAfterEmailChange(data.user);');
    expect(body.indexOf("verifyOtp")).toBeLessThan(body.indexOf("moveReservationAfterEmailChange"));
    expect(body.indexOf("moveReservationAfterEmailChange")).toBeLessThan(body.indexOf("setSession"));
  });
});
