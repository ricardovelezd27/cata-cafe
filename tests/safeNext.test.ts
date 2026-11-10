import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safeNext";

const ORIGIN = "https://cafesensible.ai";

describe("safeNext", () => {
  it("keeps same-site paths with query and hash", () => {
    expect(safeNext("/es/app/sessions/abc/results?x=1#t", { fallback: "/es/app" })).toBe(
      "/es/app/sessions/abc/results?x=1#t",
    );
    expect(safeNext("/en/app", { fallback: "/es/app" })).toBe("/en/app");
  });

  it("accepts an absolute URL on the same origin and returns path+search+hash", () => {
    expect(safeNext(`${ORIGIN}/en/app/coffees?a=b#h`, { origin: ORIGIN, fallback: "/es/app" })).toBe(
      "/en/app/coffees?a=b#h",
    );
  });

  it("rejects absolute URLs on another origin or without a known origin", () => {
    expect(safeNext("https://evil.com/es/app", { origin: ORIGIN, fallback: "/f" })).toBe("/f");
    expect(safeNext(`${ORIGIN}/es/app`, { fallback: "/f" })).toBe("/f");
    expect(safeNext("https://user:pw@cafesensible.ai/es/app", { origin: ORIGIN, fallback: "/f" })).toBe("/f");
  });

  it("rejects host-changing and malformed destinations", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "@evil.com",
      "/@evil.com",
      "/%2fevil.com",
      "/%2Fevil.com",
      "/%5cevil.com",
      "/%0d%0aX",
      "/a\u0000b",
      "javascript:alert(1)",
      "evil.com",
      "",
      undefined,
      null,
    ]) {
      expect(safeNext(bad, { fallback: "/f" })).toBe("/f");
    }
  });

  it("drops auth plumbing targets that would loop, but keeps the claim page", () => {
    for (const bad of [
      "/auth/callback?x=1",
      "/es/auth/callback",
      "/es/auth/confirm?token_hash=x",
      "/en/auth/login?next=/en/app",
      "/auth/login",
    ]) {
      expect(safeNext(bad, { fallback: "/f" })).toBe("/f");
    }
    expect(safeNext("/es/auth/claim?token=abc", { fallback: "/f" })).toBe("/es/auth/claim?token=abc");
  });

  it("returns null when no fallback is given", () => {
    expect(safeNext("//x")).toBeNull();
    expect(safeNext("/es/app")).toBe("/es/app");
  });
});
