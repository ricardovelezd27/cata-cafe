import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appMetadataClearingEmailChange,
  appMetadataRecordingEmailChange,
  completedEmailChange,
  EMAIL_CHANGE_KEY,
  normalizeAddress,
} from "@/lib/emailChangeRules";

const rec = (from: unknown, to: unknown) => ({ [EMAIL_CHANGE_KEY]: { from, to } });

describe("normalizeAddress (the same rule as SQL lower(btrim(x)))", () => {
  it("lowercases and trims SPACES only", () => {
    expect(normalizeAddress("  Ab@E.test  ")).toBe("ab@e.test");
    // btrim(x) removes spaces only: a tab or a newline stays, so JS must not widen it
    expect(normalizeAddress("\tab@e.test")).toBe("\tab@e.test");
    expect(normalizeAddress("ab@e.test\n")).toBe("ab@e.test\n");
  });
});

describe("completedEmailChange (reads app_metadata ONLY, { from, to })", () => {
  it("returns the pair once the change is complete and the account's address IS the recorded `to`", () => {
    expect(
      completedEmailChange({ email: "New@Example.test", new_email: "", app_metadata: rec("Old@Example.test ", " new@example.test") }),
    ).toEqual({ from: "old@example.test", to: "new@example.test" });
    expect(completedEmailChange({ email: "n@e.test", app_metadata: rec("o@e.test", "n@e.test") })).toEqual({
      from: "o@e.test",
      to: "n@e.test",
    });
  });
  it("is null while an address is still pending (the first of two confirmations)", () => {
    expect(completedEmailChange({ email: "o@e.test", new_email: "n@e.test", app_metadata: rec("o@e.test", "n@e.test") })).toBeNull();
  });
  it("is null when the current address is NOT the recorded `to` (the record stays inert)", () => {
    expect(completedEmailChange({ email: "other@e.test", app_metadata: rec("o@e.test", "n@e.test") })).toBeNull();
    // the account still has the old address: the change never completed
    expect(completedEmailChange({ email: "o@e.test", app_metadata: rec("o@e.test", "n@e.test") })).toBeNull();
  });
  it("is null without a well-formed record, or when from equals to", () => {
    const u = (app_metadata: Record<string, unknown>) => ({ email: "n@e.test", app_metadata });
    expect(completedEmailChange(u({}))).toBeNull();
    expect(completedEmailChange(u({ [EMAIL_CHANGE_KEY]: null }))).toBeNull();
    expect(completedEmailChange(u({ [EMAIL_CHANGE_KEY]: "o@e.test" }))).toBeNull();
    expect(completedEmailChange(u(rec(null, "n@e.test")))).toBeNull();
    expect(completedEmailChange(u(rec("  ", "n@e.test")))).toBeNull();
    expect(completedEmailChange(u(rec(42, "n@e.test")))).toBeNull();
    expect(completedEmailChange(u(rec("o@e.test", 42)))).toBeNull();
    expect(completedEmailChange(u(rec("N@E.test", "n@e.test")))).toBeNull();
    // the key of the previous round is not a record any more
    expect(completedEmailChange(u({ email_change_from: "o@e.test" }))).toBeNull();
  });
  it("is null without a user or an address", () => {
    expect(completedEmailChange(null)).toBeNull();
    expect(completedEmailChange(undefined)).toBeNull();
    expect(completedEmailChange({ email: null, app_metadata: rec("o@e.test", "n@e.test") })).toBeNull();
  });
  it("H1: a value in user_metadata (user-writable) is NEVER read", () => {
    const forged = { email: "mine@e.test", user_metadata: rec("victim@e.test", "mine@e.test") } as Parameters<typeof completedEmailChange>[0];
    expect(completedEmailChange(forged)).toBeNull();
    const both = {
      email: "mine@e.test",
      app_metadata: rec("real@e.test", "mine@e.test"),
      user_metadata: rec("victim@e.test", "mine@e.test"),
    } as Parameters<typeof completedEmailChange>[0];
    expect(completedEmailChange(both)).toEqual({ from: "real@e.test", to: "mine@e.test" });
  });
});

describe("app_metadata builders send ONLY their own key (GoTrue merges)", () => {
  it("record: { email_change: { from, to } }, both normalised, nothing else", () => {
    expect(appMetadataRecordingEmailChange(" Old@E.test ", "New@E.test")).toEqual({
      [EMAIL_CHANGE_KEY]: { from: "old@e.test", to: "new@e.test" },
    });
    expect(Object.keys(appMetadataRecordingEmailChange("a@e.test", "b@e.test"))).toEqual([EMAIL_CHANGE_KEY]);
  });
  it("clear: the record nulled, nothing else", () => {
    expect(appMetadataClearingEmailChange()).toEqual({ [EMAIL_CHANGE_KEY]: null });
  });
});

describe("wiring in app/actions/auth.ts", () => {
  const auth = readFileSync("app/actions/auth.ts", "utf8");
  const bodyOf = (name: string) => {
    const i = auth.indexOf(`run("${name}"`);
    const next = auth.indexOf("\nexport async function ", i + 1);
    return auth.slice(i, next === -1 ? undefined : next);
  };
  it("requestEmailChange never posts the addresses through the user-writable path", () => {
    const body = bodyOf("requestEmailChange");
    expect(body).toMatch(/updateUser\(\s*\{ email: address \},/);
    expect(body).not.toContain("user_metadata");
  });
  it("requestEmailChange records { from, to } (service role) only AFTER updateUser succeeded, from server-read values", () => {
    const body = bodyOf("requestEmailChange");
    expect(body.indexOf("updateUser(")).toBeLessThan(body.indexOf("if (error)"));
    expect(body.indexOf("if (error)")).toBeLessThan(body.indexOf("recordEmailChange(user, address)"));
  });
  it("confirmEmailToken: the move's ONLY call site follows the successful verify and precedes every session branch", () => {
    const body = bodyOf("confirmEmailToken");
    const move = 'if (type === "email_change") await moveReservationAfterEmailChange(data.user);';
    expect(body).toContain(move);
    expect(body.split("moveReservationAfterEmailChange").length - 1).toBe(1);
    const verify = body.indexOf("verifyOtp");
    const verifyFailed = body.indexOf("if (error) throw", verify);
    expect(verify).toBeGreaterThan(-1);
    expect(verifyFailed).toBeGreaterThan(verify);
    expect(body.indexOf(move)).toBeGreaterThan(verifyFailed);
    // before: no session at all, zero-click setSession, the parked path
    for (const later of ["if (!session?.access_token", "setSession", "storePendingSignIn", "checkSignInIntent"]) {
      expect(body.indexOf(move), later).toBeLessThan(body.indexOf(later));
    }
  });
  it("no other action moves anything: acceptPendingSignIn and rejectPendingSignIn never touch the reservation", () => {
    for (const name of ["acceptPendingSignIn", "rejectPendingSignIn"]) {
      expect(bodyOf(name), name).not.toContain("moveReservationAfterEmailChange");
      expect(bodyOf(name), name).not.toContain("moveWaitlistEntry");
    }
    expect(auth.split("moveReservationAfterEmailChange(").length - 1).toBe(1);
  });
});
