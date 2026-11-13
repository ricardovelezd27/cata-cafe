import { describe, expect, it } from "vitest";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import {
  IDENTITY_EPOCH_KEY,
  classifyIdentityLookup,
  decideForMarker,
  identityMismatch,
  isNoSessionError,
  parseIdentityMarker,
  serializeIdentityMarker,
  shouldStopForLookup,
} from "@/lib/expectedUser";
import { classifyGuestLookup, isFinalJoinRefusal } from "@/lib/joinRules";

describe("identityMismatch (server rule)", () => {
  it("absent expectation never mismatches (legacy callers)", () => {
    expect(identityMismatch(undefined, "b")).toBe(false);
    expect(identityMismatch(undefined, null)).toBe(false);
  });
  it("same user matches", () => {
    expect(identityMismatch("a", "a")).toBe(false);
  });
  it("a different user mismatches", () => {
    expect(identityMismatch("a", "b")).toBe(true);
  });
  it("NO user in the cookie mismatches when an id was expected", () => {
    expect(identityMismatch("a", null)).toBe(true);
  });
});

describe("isNoSessionError / classifyIdentityLookup (L1)", () => {
  const same = (u: { id: string }) => u.id === "a";
  it("AuthSessionMissingError is no session", () => {
    expect(isNoSessionError(new AuthSessionMissingError())).toBe(true);
    expect(classifyIdentityLookup({ user: null, error: new AuthSessionMissingError() }, same)).toBe("different");
  });
  it.each([
    ["refresh_token_not_found", 400],
    ["refresh_token_already_used", 400],
    ["session_expired", 401],
    ["session_not_found", 403],
    ["bad_jwt", 401],
  ])("auth API error %s (%i) is no session", (code, status) => {
    const err = new AuthApiError("x", status, code);
    expect(isNoSessionError(err)).toBe(true);
    expect(classifyIdentityLookup({ user: null, error: err }, same)).toBe("different");
  });
  it("a retryable fetch error (status 0) is unreachable", () => {
    const err = new AuthRetryableFetchError("offline", 0);
    expect(isNoSessionError(err)).toBe(false);
    expect(classifyIdentityLookup({ user: null, error: err }, same)).toBe("unreachable");
  });
  it("a 5xx auth API error is unreachable", () => {
    const err = new AuthApiError("down", 503, "unexpected_failure");
    expect(classifyIdentityLookup({ user: null, error: err }, same)).toBe("unreachable");
  });
  it("an unknown error without a status is unreachable", () => {
    expect(classifyIdentityLookup({ user: null, error: new AuthUnknownError("?", new Error("?")) }, same)).toBe(
      "unreachable",
    );
    expect(classifyIdentityLookup({ user: null, error: {} }, same)).toBe("unreachable");
  });
  it("serialized copies (plain objects) classify the same way", () => {
    expect(isNoSessionError({ name: "AuthSessionMissingError" })).toBe(true);
    expect(isNoSessionError({ code: "session_not_found" })).toBe(true);
    expect(isNoSessionError({ status: 429 })).toBe(true);
    expect(isNoSessionError({ status: 0 })).toBe(false);
    expect(isNoSessionError({ status: 500 })).toBe(false);
    expect(isNoSessionError(null)).toBe(false);
  });
  it("a user is same or different, no user and no error is different", () => {
    expect(classifyIdentityLookup({ user: { id: "a" }, error: null }, same)).toBe("same");
    expect(classifyIdentityLookup({ user: { id: "b" }, error: null }, same)).toBe("different");
    expect(classifyIdentityLookup({ user: null, error: null }, same)).toBe("different");
  });
  it("classifyGuestLookup uses it (auth-js errors)", () => {
    expect(classifyGuestLookup("a", { user: null, error: new AuthApiError("x", 400, "refresh_token_not_found") })).toBe(
      "different",
    );
    expect(classifyGuestLookup("a", { user: null, error: new AuthRetryableFetchError("x", 0) })).toBe("unreachable");
  });
});

describe("cross-tab marker", () => {
  it("round trips", () => {
    expect(parseIdentityMarker(serializeIdentityMarker("a", 5))).toEqual({ at: 5, leftUserId: "a" });
  });
  it("rejects junk", () => {
    expect(parseIdentityMarker(null)).toBeNull();
    expect(parseIdentityMarker("")).toBeNull();
    expect(parseIdentityMarker("not json")).toBeNull();
    expect(parseIdentityMarker(JSON.stringify({ at: "x", leftUserId: "a" }))).toBeNull();
    expect(parseIdentityMarker(JSON.stringify({ at: 1 }))).toBeNull();
  });
  it("the key is stable", () => {
    expect(IDENTITY_EPOCH_KEY).toBe("cata_identity_epoch");
  });
  it("stop when the marker names the rendered user", () => {
    expect(decideForMarker("a", { at: 1, leftUserId: "a" })).toBe("stop");
  });
  it("ignore when another user left", () => {
    expect(decideForMarker("a", { at: 1, leftUserId: "b" })).toBe("ignore");
  });
  it("recheck when the leaving user was unknown", () => {
    expect(decideForMarker("a", { at: 1, leftUserId: "" })).toBe("recheck");
  });
  it("ignore with no marker", () => {
    expect(decideForMarker("a", null)).toBe("ignore");
  });
});

describe("shouldStopForLookup", () => {
  it("stops only when the signed-in person is different", () => {
    expect(shouldStopForLookup("different")).toBe(true);
    expect(shouldStopForLookup("same")).toBe(false);
    expect(shouldStopForLookup("unreachable")).toBe(false);
  });
});

describe("isFinalJoinRefusal", () => {
  it("final refusals", () => {
    for (const c of ["session_closed", "token_expired", "token_exhausted", "entries_closed", "invalid_token"]) {
      expect(isFinalJoinRefusal(c)).toBe(true);
    }
  });
  it("transient or other codes are not", () => {
    for (const c of ["unknown", "offline", "rate_limited", "not_authenticated"]) {
      expect(isFinalJoinRefusal(c)).toBe(false);
    }
  });
});
