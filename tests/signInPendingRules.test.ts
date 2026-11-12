import { describe, expect, it } from "vitest";
import { classifyPendingFailure, pendingEmailMatches } from "@/lib/signInPendingRules";

describe("classifyPendingFailure", () => {
  it("retries a retryable fetch error (auth-js shape, status 0)", () => {
    expect(classifyPendingFailure({ name: "AuthRetryableFetchError", message: "fetch failed", status: 0 })).toBe("retry");
  });
  it("retries a 500 and a 503", () => {
    expect(classifyPendingFailure({ name: "AuthApiError", status: 500, code: "unexpected_failure" })).toBe("retry");
    expect(classifyPendingFailure({ name: "AuthRetryableFetchError", status: 503 })).toBe("retry");
  });
  it("expires on 401 and 403", () => {
    expect(classifyPendingFailure({ name: "AuthApiError", status: 401 })).toBe("expired");
    expect(classifyPendingFailure({ name: "AuthApiError", status: 403 })).toBe("expired");
  });
  it("expires on session_not_found and invalid refresh tokens", () => {
    expect(classifyPendingFailure({ name: "AuthApiError", status: 400, code: "session_not_found" })).toBe("expired");
    expect(classifyPendingFailure({ name: "AuthApiError", status: 400, code: "refresh_token_already_used" })).toBe("expired");
    expect(classifyPendingFailure({ message: "Invalid Refresh Token: Refresh Token Not Found" })).toBe("expired");
    expect(classifyPendingFailure({ name: "AuthSessionMissingError", message: "Auth session missing!" })).toBe("expired");
  });
  it("treats an unknown shape as retry", () => {
    expect(classifyPendingFailure(null)).toBe("retry");
    expect(classifyPendingFailure(undefined)).toBe("retry");
    expect(classifyPendingFailure("boom")).toBe("retry");
    expect(classifyPendingFailure({})).toBe("retry");
    expect(classifyPendingFailure({ status: 429 })).toBe("retry");
  });
});

describe("pendingEmailMatches", () => {
  it("matches the same address ignoring case and whitespace", () => {
    expect(pendingEmailMatches("Ana@Example.com", "  ana@example.COM ")).toBe(true);
  });
  it("refuses a different address", () => {
    expect(pendingEmailMatches("ana@example.com", "ana@example.org")).toBe(false);
    expect(pendingEmailMatches("ana@example.com", "anna@example.com")).toBe(false);
  });
  it("refuses empty or non-string input", () => {
    expect(pendingEmailMatches("", "")).toBe(false);
    expect(pendingEmailMatches("  ", "ana@example.com")).toBe(false);
    expect(pendingEmailMatches("ana@example.com", undefined)).toBe(false);
    expect(pendingEmailMatches(null, null)).toBe(false);
  });
});
