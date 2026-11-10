import { describe, expect, it } from "vitest";
import { sessionHref } from "@/lib/sessionRouting";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const base = { id: "s1", status: "active", isGroup: true, startedAt: new Date("2026-11-10T10:00:00Z") };
const past = new Date(NOW.getTime() - 1);
const future = new Date(NOW.getTime() + 60_000);

describe("sessionHref", () => {
  it("expired active group session goes to results for owner and participant", () => {
    for (const isOwner of [true, false]) {
      expect(sessionHref({ ...base, closesAt: past }, { locale: "es", isOwner }, NOW)).toBe(
        "/es/app/sessions/s1/results",
      );
    }
  });
  it("an unstarted live group session with a future closesAt waits in /waiting", () => {
    expect(
      sessionHref({ ...base, startedAt: null, closesAt: future }, { locale: "es", isOwner: false }, NOW),
    ).toBe("/es/app/sessions/s1/waiting");
  });
  it("an unstarted expired session goes to results, not waiting", () => {
    expect(
      sessionHref({ ...base, startedAt: null, closesAt: past }, { locale: "en", isOwner: false }, NOW),
    ).toBe("/en/app/sessions/s1/results");
  });
  it("admin viewer is unchanged", () => {
    expect(
      sessionHref({ ...base, closesAt: future }, { locale: "es", isOwner: false, isAdminViewer: true }, NOW),
    ).toBe("/es/app/sessions/s1/results");
  });
  it("absent closesAt behaves as before", () => {
    expect(sessionHref({ ...base, closesAt: null }, { locale: "es", isOwner: true }, NOW)).toBe(
      "/es/app/sessions/s1/cup",
    );
    expect(sessionHref({ ...base, status: "closed", closesAt: null }, { locale: "es", isOwner: true }, NOW)).toBe(
      "/es/app/sessions/s1/results",
    );
  });
  it("accepts a serialized (string) closesAt", () => {
    expect(
      sessionHref({ ...base, closesAt: past.toISOString() }, { locale: "es", isOwner: true }, NOW),
    ).toBe("/es/app/sessions/s1/results");
  });
});
