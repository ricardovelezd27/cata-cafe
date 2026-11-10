import { describe, expect, it } from "vitest";
import { classifyAuthResult } from "@/lib/authState";
import { loginHref, signedOutRedirect } from "@/lib/authRedirect";

describe("classifyAuthResult", () => {
  it("a user without an error is a user (anonymous guests included)", () => {
    expect(classifyAuthResult({ user: { id: "u", is_anonymous: true }, error: null })).toBe("user");
  });
  it("no user and no error is signed out", () => {
    expect(classifyAuthResult({ user: null, error: null })).toBe("none");
  });
  it("a missing session is signed out", () => {
    expect(classifyAuthResult({ user: null, error: { name: "AuthSessionMissingError", status: 400 } })).toBe("none");
  });
  it("a rejected token (4xx) is signed out", () => {
    expect(classifyAuthResult({ user: null, error: { name: "AuthApiError", status: 401 } })).toBe("none");
    expect(classifyAuthResult({ user: null, error: { name: "AuthApiError", status: 403 } })).toBe("none");
  });
  it("timeouts and rate limits (408, 429) are unreachable, never signed out", () => {
    expect(classifyAuthResult({ user: null, error: { name: "AuthApiError", status: 408 } })).toBe("unreachable");
    expect(classifyAuthResult({ user: null, error: { name: "AuthApiError", status: 429 } })).toBe("unreachable");
    expect(classifyAuthResult({ user: null, error: { name: "AuthApiError", status: 404 } })).toBe("none");
    expect(classifyAuthResult({ user: null, error: { name: "AuthApiError", status: 422 } })).toBe("none");
  });
  it("network failures and 5xx are unreachable, never signed out", () => {
    expect(classifyAuthResult({ user: null, error: { name: "AuthRetryableFetchError", status: 0 } })).toBe("unreachable");
    expect(classifyAuthResult({ user: null, error: { name: "AuthApiError", status: 503 } })).toBe("unreachable");
    expect(classifyAuthResult({ user: null, error: { name: "AuthUnknownError" } })).toBe("unreachable");
  });
});

describe("loginHref", () => {
  it("carries a safe next, encoded", () => {
    expect(loginHref("es", "/es/app/sessions/a/results?x=1")).toBe(
      "/es/auth/login?next=%2Fes%2Fapp%2Fsessions%2Fa%2Fresults%3Fx%3D1",
    );
    expect(loginHref("en", "/en/app")).toBe("/en/auth/login?next=%2Fen%2Fapp");
  });
  it("drops unsafe targets", () => {
    expect(loginHref("es", "//evil.com")).toBe("/es/auth/login");
    expect(loginHref("es", "/es/auth/login")).toBe("/es/auth/login");
    expect(loginHref("fr", undefined)).toBe("/es/auth/login");
  });
});

describe("signedOutRedirect", () => {
  it("redirects /app paths with locale and query preserved", () => {
    expect(signedOutRedirect("/en/app/sessions/abc/results", "?t=1")).toBe(
      "/en/auth/login?next=%2Fen%2Fapp%2Fsessions%2Fabc%2Fresults%3Ft%3D1",
    );
    expect(signedOutRedirect("/app/coffees", "")).toBe("/es/auth/login?next=%2Fapp%2Fcoffees");
    expect(signedOutRedirect("/es/app", "")).toBe("/es/auth/login?next=%2Fes%2Fapp");
  });
  it("leaves public paths alone", () => {
    expect(signedOutRedirect("/", "")).toBeNull();
    expect(signedOutRedirect("/en", "")).toBeNull();
    expect(signedOutRedirect("/es/auth/login", "")).toBeNull();
    expect(signedOutRedirect("/es/join/abc", "")).toBeNull();
    expect(signedOutRedirect("/es/application", "")).toBeNull();
  });
});
