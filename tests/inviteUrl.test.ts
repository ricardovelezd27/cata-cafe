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
