import { describe, expect, it } from "vitest";
import { consentStamp } from "@/lib/legal/consent";

describe("consentStamp", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  it("writes null for both columns while the legal pages are unpublished", () => {
    expect(consentStamp(false, "v1", now)).toEqual({ consentAt: null, consentNoticeVersion: null });
  });
  it("stamps time and notice version once published", () => {
    expect(consentStamp(true, "v1", now)).toEqual({ consentAt: now, consentNoticeVersion: "v1" });
  });
});
