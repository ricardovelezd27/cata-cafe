import { describe, expect, it } from "vitest";
import { groupSessionInviteUrl } from "@/lib/inviteUrl";

const base = { token: "tok", locale: "es", origin: "https://x.test" };

describe("groupSessionInviteUrl", () => {
  it("sends a linked member straight to the join page", () => {
    expect(groupSessionInviteUrl({ ...base, linked: true })).toBe("https://x.test/es/join/tok");
  });
  it("sends an unlinked recipient through login with the join as next, never carrying an address", () => {
    const url = groupSessionInviteUrl({ ...base, linked: false });
    expect(url).toBe("https://x.test/es/auth/login?next=%2Fes%2Fjoin%2Ftok");
    expect(url).not.toContain("email=");
  });
  it("honours the locale", () => {
    expect(groupSessionInviteUrl({ ...base, locale: "en", linked: false })).toBe(
      "https://x.test/en/auth/login?next=%2Fen%2Fjoin%2Ftok",
    );
  });
});

import { normalizeSiteOrigin } from "@/lib/inviteUrl";

describe("normalizeSiteOrigin", () => {
  it("upgrades a real host configured with http to https (the 2026-11-11 sign-in outage)", () => {
    expect(normalizeSiteOrigin("http://cata-cafe-opal.vercel.app")).toBe("https://cata-cafe-opal.vercel.app");
    expect(normalizeSiteOrigin("http://cata-cafe-opal.vercel.app/")).toBe("https://cata-cafe-opal.vercel.app");
  });
  it("leaves https alone and strips trailing slashes", () => {
    expect(normalizeSiteOrigin("https://cafesensible.ai//")).toBe("https://cafesensible.ai");
  });
  it("keeps http for local development hosts, with their port", () => {
    expect(normalizeSiteOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeSiteOrigin("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
  });
  it("falls back to the dev origin when unset or blank", () => {
    expect(normalizeSiteOrigin(undefined)).toBe("http://localhost:3000");
    expect(normalizeSiteOrigin("  ")).toBe("http://localhost:3000");
  });
});
