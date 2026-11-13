import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appMetadataClearingOldAddress,
  appMetadataRecordingOldAddress,
  completedEmailChange,
  EMAIL_CHANGE_FROM_KEY,
} from "@/lib/emailChangeRules";

const meta = (from: unknown) => ({ [EMAIL_CHANGE_FROM_KEY]: from });

describe("completedEmailChange (reads app_metadata ONLY)", () => {
  it("returns the pair once the change is complete (no pending address)", () => {
    expect(completedEmailChange({ email: "New@Example.test", new_email: "", app_metadata: meta("Old@Example.test ") })).toEqual({
      from: "old@example.test",
      to: "new@example.test",
    });
    expect(completedEmailChange({ email: "n@e.test", app_metadata: meta("o@e.test") })).toEqual({ from: "o@e.test", to: "n@e.test" });
  });
  it("is null while an address is still pending (the first of two confirmations)", () => {
    expect(completedEmailChange({ email: "o@e.test", new_email: "n@e.test", app_metadata: meta("o@e.test") })).toBeNull();
  });
  it("is null without a recorded previous address, or when it equals the current one", () => {
    expect(completedEmailChange({ email: "n@e.test", app_metadata: {} })).toBeNull();
    expect(completedEmailChange({ email: "n@e.test", app_metadata: meta(null) })).toBeNull();
    expect(completedEmailChange({ email: "n@e.test", app_metadata: meta("  ") })).toBeNull();
    expect(completedEmailChange({ email: "n@e.test", app_metadata: meta(42) })).toBeNull();
    expect(completedEmailChange({ email: "N@E.test", app_metadata: meta("n@e.test") })).toBeNull();
  });
  it("is null without a user or an address", () => {
    expect(completedEmailChange(null)).toBeNull();
    expect(completedEmailChange(undefined)).toBeNull();
    expect(completedEmailChange({ email: null, app_metadata: meta("o@e.test") })).toBeNull();
  });
  it("H1: a value in user_metadata (user-writable) is NEVER read", () => {
    const forged = { email: "mine@e.test", user_metadata: meta("victim@e.test") } as Parameters<typeof completedEmailChange>[0];
    expect(completedEmailChange(forged)).toBeNull();
    // and it does not override the real record either
    const both = { email: "mine@e.test", app_metadata: meta("real@e.test"), user_metadata: meta("victim@e.test") } as Parameters<typeof completedEmailChange>[0];
    expect(completedEmailChange(both)).toEqual({ from: "real@e.test", to: "mine@e.test" });
  });
});

describe("app_metadata builders", () => {
  it("record keeps the existing keys and stores the normalised old address", () => {
    expect(appMetadataRecordingOldAddress({ provider: "email", providers: ["email"] }, " Old@E.test ")).toEqual({
      provider: "email",
      providers: ["email"],
      [EMAIL_CHANGE_FROM_KEY]: "old@e.test",
    });
    expect(appMetadataRecordingOldAddress(null, "o@e.test")).toEqual({ [EMAIL_CHANGE_FROM_KEY]: "o@e.test" });
  });
  it("clear keeps the other keys and nulls the record", () => {
    expect(appMetadataClearingOldAddress({ provider: "email", [EMAIL_CHANGE_FROM_KEY]: "o@e.test" })).toEqual({
      provider: "email",
      [EMAIL_CHANGE_FROM_KEY]: null,
    });
  });
});

describe("wiring in app/actions/auth.ts", () => {
  const auth = readFileSync("app/actions/auth.ts", "utf8");
  const bodyOf = (name: string) => {
    const i = auth.indexOf(`run("${name}"`);
    const next = auth.indexOf("\nexport async function ", i + 1);
    return auth.slice(i, next === -1 ? undefined : next);
  };
  it("requestEmailChange never posts the old address through the user-writable path", () => {
    const body = bodyOf("requestEmailChange");
    // the updateUser call carries the new address only: no `data` field
    expect(body).toMatch(/updateUser\(\s*\{ email: address \},/);
    expect(body).not.toContain("user_metadata");
    expect(body).toContain("updateUser(");
  });
  it("requestEmailChange records the old address (service role) only AFTER updateUser succeeded", () => {
    const body = bodyOf("requestEmailChange");
    expect(body.indexOf("updateUser(")).toBeLessThan(body.indexOf("if (error)"));
    expect(body.indexOf("if (error)")).toBeLessThan(body.indexOf("recordOldAddressForEmailChange(user)"));
  });
  it("confirmEmailToken moves only for email_change, only once setSession succeeded, never on the parked path", () => {
    const body = bodyOf("confirmEmailToken");
    const move = 'if (type === "email_change") await moveReservationAfterEmailChange(data.user);';
    expect(body).toContain(move);
    expect(body.indexOf("verifyOtp")).toBeLessThan(body.indexOf("setSession"));
    expect(body.indexOf("setSession")).toBeLessThan(body.indexOf("if (!setError)"));
    expect(body.indexOf("if (!setError)")).toBeLessThan(body.indexOf(move));
    // the move sits INSIDE the success branch, before its return, and before storePendingSignIn
    expect(body.indexOf(move)).toBeLessThan(body.indexOf("storePendingSignIn"));
    expect(body.split("moveReservationAfterEmailChange").length - 1).toBe(1);
  });
  it("acceptPendingSignIn moves after setSession succeeded, for the user the card showed", () => {
    const body = bodyOf("acceptPendingSignIn");
    expect(body.indexOf("setSession")).toBeLessThan(body.indexOf("moveReservationAfterEmailChange(who.user)"));
  });
  it("rejectPendingSignIn never moves anything", () => {
    expect(bodyOf("rejectPendingSignIn")).not.toContain("moveReservationAfterEmailChange");
    expect(bodyOf("rejectPendingSignIn")).not.toContain("moveWaitlistEntry");
  });
});
