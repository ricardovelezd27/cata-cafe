import { describe, expect, it } from "vitest";
import { sanitizeSrcTag, waitlistSource } from "@/lib/waitlistSource";

describe("waitlistSource", () => {
  it("uses the form variant", () => {
    expect(waitlistSource("hero", null)).toBe("hero");
    expect(waitlistSource("founding", "")).toBe("founding");
  });
  it("keeps a sanitized ?src= tag", () => {
    expect(waitlistSource("hero", "Chile")).toBe("hero:chile");
    expect(waitlistSource("founding", "tiktok_1")).toBe("founding:tiktok_1");
  });
  it("drops hostile or oversized tags", () => {
    expect(sanitizeSrcTag("<script>")).toBeNull();
    expect(sanitizeSrcTag("a".repeat(25))).toBeNull();
    expect(sanitizeSrcTag("a b")).toBeNull();
    expect(waitlistSource("hero", "x;drop")).toBe("hero");
  });
  it("falls back to landing for an unknown variant", () => {
    expect(waitlistSource("admin", "chile")).toBe("landing");
    expect(waitlistSource(undefined, undefined)).toBe("landing");
  });
});
