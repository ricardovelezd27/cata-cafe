import { describe, expect, it } from "vitest";
import { buildRegisteredUsersCsv } from "@/lib/analytics/usersCsv";

describe("buildRegisteredUsersCsv", () => {
  it("keeps only registered accounts with email, sorted by created_at, lowercased", () => {
    const { csv, count } = buildRegisteredUsersCsv([
      { email: "B@x.com", isAnonymous: false, createdAt: "2026-02-01T00:00:00Z" },
      { email: null, isAnonymous: true, createdAt: "2026-01-01T00:00:00Z" },
      { email: "a@x.com", isAnonymous: false, createdAt: "2026-01-01T00:00:00Z" },
      { email: "g@x.com", isAnonymous: true, createdAt: "2026-01-05T00:00:00Z" },
      { email: null, isAnonymous: false, createdAt: "2026-01-06T00:00:00Z" },
    ]);
    expect(count).toBe(2);
    expect(csv).toBe("email,created_at\na@x.com,2026-01-01T00:00:00Z\nb@x.com,2026-02-01T00:00:00Z\n");
  });

  it("quotes commas and neutralises formula prefixes", () => {
    const { csv } = buildRegisteredUsersCsv([
      { email: "=cmd@x.com", isAnonymous: false, createdAt: "t" },
      { email: 'a,"b"@x.com', isAnonymous: false, createdAt: "u" },
    ]);
    expect(csv).toContain("'=cmd@x.com,t");
    expect(csv).toContain('"a,""b""@x.com",u');
  });
});
