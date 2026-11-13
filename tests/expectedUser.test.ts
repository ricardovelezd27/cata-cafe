import { describe, expect, it } from "vitest";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import {
  IDENTITY_EPOCH_KEY,
  actionOnMarkerRecheck,
  actionOnResume,
  classifyBrowserSession,
  classifyIdentityLookup,
  decideForMarker,
  decideServerIdentity,
  isNoSessionError,
  parseIdentityMarker,
  serializeIdentityMarker,
} from "@/lib/expectedUser";
import { classifyGuestLookup, isFinalJoinRefusal } from "@/lib/joinRules";

describe("decideServerIdentity (server table)", () => {
  it("a user who matches the expectation proceeds", () => {
    expect(decideServerIdentity({ state: "user", userId: "a" }, "a")).toBe("proceed");
  });
  it("a user who differs from the expectation is identity_changed", () => {
    expect(decideServerIdentity({ state: "user", userId: "b" }, "a")).toBe("identity_changed");
  });
  it("a user with no expectation proceeds", () => {
    expect(decideServerIdentity({ state: "user", userId: "b" }, undefined)).toBe("proceed");
  });
  it("nobody signed in behaves as unauthenticated, never identity_changed", () => {
    expect(decideServerIdentity({ state: "none" }, "a")).toBe("as_unauthenticated");
    expect(decideServerIdentity({ state: "none" }, undefined)).toBe("as_unauthenticated");
  });
  it("an unreachable auth lookup behaves as unreachable, never identity_changed", () => {
    expect(decideServerIdentity({ state: "unreachable" }, "a")).toBe("as_unreachable");
    expect(decideServerIdentity({ state: "unreachable" }, undefined)).toBe("as_unreachable");
  });
});

describe("classifyBrowserSession (getSession read)", () => {
  const user = (id: string) => ({ user: { id } });
  it("a session with the rendered id is same", () => {
    expect(classifyBrowserSession({ session: user("a"), error: null }, "a")).toBe("same");
  });
  it("a session with another id is different", () => {
    expect(classifyBrowserSession({ session: user("b"), error: null }, "a")).toBe("different");
  });
  it("no session and no error is none", () => {
    expect(classifyBrowserSession({ session: null, error: null }, "a")).toBe("none");
  });
  it("any error is unknown, whatever its status (no 4xx guessing)", () => {
    expect(classifyBrowserSession({ session: null, error: new AuthApiError("x", 401, "bad_jwt") }, "a")).toBe("unknown");
    expect(classifyBrowserSession({ session: null, error: new AuthRetryableFetchError("x", 0) }, "a")).toBe("unknown");
    expect(classifyBrowserSession({ session: null, error: new AuthSessionMissingError() }, "a")).toBe("unknown");
  });
  it("an error wins even if a stale session object came with it", () => {
    expect(classifyBrowserSession({ session: user("b"), error: new Error("x") }, "a")).toBe("unknown");
  });
});

describe("resume table (actionOnResume)", () => {
  it.each([
    ["different", "latch"],
    ["same", "clear"],
    ["none", "nothing"],
    ["unknown", "nothing"],
  ] as const)("%s -> %s", (identity, action) => {
    expect(actionOnResume(identity)).toBe(action);
  });
});

describe("marker table (decideForMarker, then actionOnMarkerRecheck)", () => {
  it("a marker naming the rendered user asks for a re-check", () => {
    expect(decideForMarker("a", { at: 1, leftUserId: "a" })).toBe("recheck");
  });
  it("a marker naming nobody in particular asks for a re-check", () => {
    expect(decideForMarker("a", { at: 1, leftUserId: "" })).toBe("recheck");
  });
  it("a marker naming another user is ignored", () => {
    expect(decideForMarker("a", { at: 1, leftUserId: "b" })).toBe("ignore");
  });
  it("no marker is ignored", () => {
    expect(decideForMarker("a", null)).toBe("ignore");
  });
  it.each([
    ["different", "latch"],
    ["none", "latch"],
    ["same", "nothing"],
    ["unknown", "nothing"],
  ] as const)("after the re-check: %s -> %s", (identity, action) => {
    expect(actionOnMarkerRecheck(identity)).toBe(action);
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
