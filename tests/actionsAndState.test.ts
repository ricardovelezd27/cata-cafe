import { describe, expect, it } from "vitest";
import { classifyActionError, isActionErrorCode } from "@/lib/actionResult";
import { assertSessionWritable, isSessionClosed, planClosesAtChange } from "@/lib/sessionState";
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

// S6 CP-C3 — editing closesAt after creation.
describe("planClosesAtChange", () => {
  const NOW = Date.parse("2026-10-20T12:00:00Z");
  const group = { isGroup: true };

  it("is a no-op when the field is absent", () => {
    expect(planClosesAtChange(group, undefined, NOW)).toBeNull();
  });

  it("sets an automatic close on a live session that already started (end of day UTC, isAsync on)", () => {
    const plan = planClosesAtChange({ ...group, startedAt: new Date(NOW - 3_600_000) } as { isGroup: boolean }, "2026-10-22", NOW);
    expect(plan?.isAsync).toBe(true);
    expect(plan?.closesAt?.toISOString()).toBe("2026-10-22T23:59:59.999Z");
  });

  it("accepts today (the cron closes it the next morning)", () => {
    expect(planClosesAtChange(group, "2026-10-20", NOW)?.closesAt?.toISOString()).toBe("2026-10-20T23:59:59.999Z");
  });

  it("clears the close on an async session with cuppers → live, manual close", () => {
    expect(planClosesAtChange(group, "", NOW)).toEqual({ closesAt: null, isAsync: false });
    expect(planClosesAtChange(group, null, NOW)).toEqual({ closesAt: null, isAsync: false });
  });

  it("rejects a past date and malformed input", () => {
    expect(() => planClosesAtChange(group, "2026-10-19", NOW)).toThrow("invalid_closes_at");
    expect(() => planClosesAtChange(group, "20-10-2026", NOW)).toThrow("invalid_closes_at");
    expect(() => planClosesAtChange(group, "2026-13-40", NOW)).toThrow("invalid_closes_at");
  });

  it("solo sessions carry no close date", () => {
    expect(() => planClosesAtChange({ isGroup: false }, "2026-10-22", NOW)).toThrow("not_group_session");
    expect(() => planClosesAtChange({ isGroup: false }, "", NOW)).toThrow("not_group_session");
  });
});
