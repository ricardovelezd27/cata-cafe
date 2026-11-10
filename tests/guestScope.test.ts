import { describe, expect, it } from "vitest";
import { isGuestAllowedPath, isRegisteredUser, stripLocale } from "@/lib/guestScope";

describe("isRegisteredUser", () => {
  it("is false for anonymous users and for no user", () => {
    expect(isRegisteredUser({ is_anonymous: true })).toBe(false);
    expect(isRegisteredUser(null)).toBe(false);
    expect(isRegisteredUser(undefined)).toBe(false);
  });
  it("is true for real accounts, whether the flag is false or absent", () => {
    expect(isRegisteredUser({ is_anonymous: false })).toBe(true);
    expect(isRegisteredUser({})).toBe(true);
  });
});

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
      "/app/warmup",
      "/app/warmup/brazo-lento",
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
      // "Catar ahora" creates a session under the caller's identity — gated like the wizard.
      "/app/sessions/express",
      "/app/sessions/abc/edit",
      "/app/profiles",
      "/app/warmups",
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
