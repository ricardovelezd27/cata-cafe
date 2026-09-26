import { describe, expect, it } from "vitest";
import { isGuestAllowedPath, stripLocale } from "@/lib/guestScope";

describe("guest scope", () => {
  it("lets anonymous guests cup, wait, see results / print, and their own profile", () => {
    for (const p of [
      "/app/sessions/abc/cup",
      "/app/sessions/abc/waiting",
      "/app/sessions/abc/results",
      "/app/sessions/abc/print",
      "/app/sessions",
      "/app/profile",
      "/app/profile/history",
      "/app",
    ]) {
      expect(isGuestAllowedPath(p)).toBe(true);
    }
  });
  it("keeps them out of asset-creating areas", () => {
    for (const p of [
      "/app/coffees",
      "/app/coffees/new",
      "/app/coffees/abc",
      "/app/groups",
      "/app/sessions/new",
      "/app/sessions/abc/edit",
      "/app/profiles",
      "/app/insights",
    ]) {
      expect(isGuestAllowedPath(p)).toBe(false);
    }
  });
  it("strips the locale prefix only", () => {
    expect(stripLocale("/es/app/sessions")).toBe("/app/sessions");
    expect(stripLocale("/en")).toBe("/");
    expect(stripLocale("/app/x")).toBe("/app/x");
  });
});
