import { describe, expect, it } from "vitest";
import { classifyActionError, isActionErrorCode } from "@/lib/actionResult";
import { assertSessionWritable, isSessionClosed } from "@/lib/sessionState";
import { missingProductionEnv } from "@/lib/env";
import { redactPath } from "@/lib/log";

describe("session state", () => {
  it("closed sessions are read-only", () => {
    expect(() => assertSessionWritable({ status: "closed" })).toThrow("session_closed");
    expect(isSessionClosed({ status: "closed" })).toBe(true);
  });
  it("active and legacy statuses stay writable", () => {
    for (const status of ["active", "draft", "open"]) {
      expect(() => assertSessionWritable({ status })).not.toThrow();
    }
  });
});

describe("classifyActionError", () => {
  it("passes known codes through", () => {
    expect(classifyActionError(new Error("not_found_or_forbidden"))).toBe("not_found_or_forbidden");
    expect(classifyActionError(new Error("session_closed"))).toBe("session_closed");
    expect(classifyActionError(new Error("token_expired"))).toBe("token_expired");
  });
  it("maps the legacy forbidden throw; a legacy not_found is already a real code", () => {
    expect(classifyActionError(new Error("forbidden"))).toBe("not_found_or_forbidden");
    expect(classifyActionError(new Error("not_found"))).toBe("not_found");
  });
  it("maps Prisma known-request codes", () => {
    expect(classifyActionError({ code: "P2002" })).toBe("conflict");
    expect(classifyActionError({ code: "P2025" })).toBe("not_found");
    expect(classifyActionError({ code: "P2003" })).toBe("invalid_reference");
  });
  it("everything else is unknown", () => {
    expect(classifyActionError(new Error("boom"))).toBe("unknown");
    expect(classifyActionError(null)).toBe("unknown");
    expect(isActionErrorCode("nope")).toBe(false);
  });
});

describe("production env assertions", () => {
  it("lists every missing required variable", () => {
    const missing = missingProductionEnv({ NEXT_PUBLIC_SUPABASE_URL: "x" });
    expect(missing).toContain("NEXT_PUBLIC_SITE_URL");
    expect(missing).toContain("CRON_SECRET");
    expect(missing).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
  it("treats blank values as missing", () => {
    expect(missingProductionEnv({ CRON_SECRET: "  " })).toContain("CRON_SECRET");
  });
});

describe("log path redaction", () => {
  it("hides tokens in join and auth URLs but leaves other paths alone", () => {
    expect(redactPath("/es/join/abc-123")).toBe("/es/join/…");
    expect(redactPath("/join/coffee/abc")).toBe("/join/coffee/…");
    expect(redactPath("/auth/callback")).toBe("/auth/…");
    expect(redactPath("/es/app/sessions/xyz/results")).toBe("/es/app/sessions/xyz/results");
  });
});
