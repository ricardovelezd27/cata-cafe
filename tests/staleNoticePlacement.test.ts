import { describe, expect, it } from "vitest";
import { isCupShellPath, staleNoticeRendersIn } from "@/lib/staleNoticePlacement";

describe("stale-bundle notice placement", () => {
  it("cup route: only the in-shell copy renders", () => {
    const p = "/es/app/sessions/abc-123/cup";
    expect(isCupShellPath(p)).toBe(true);
    expect(staleNoticeRendersIn("cup", p)).toBe(true);
    expect(staleNoticeRendersIn("app", p)).toBe(false);
  });
  it("cup route variants (english, trailing slash)", () => {
    expect(isCupShellPath("/en/app/sessions/x/cup/")).toBe(true);
    expect(isCupShellPath("/en/app/sessions/x/cup/anything")).toBe(true);
  });
  it.each([
    "/es/app",
    "/es/app/sessions",
    "/es/app/sessions/abc/waiting",
    "/es/app/sessions/abc/results",
    "/es/app/sessions/abc/edit",
    "/es/app/sessions/abc/cupboard",
    "/es/app/coffees/abc",
  ])("%s: only the app-layout copy renders", (p) => {
    expect(isCupShellPath(p)).toBe(false);
    expect(staleNoticeRendersIn("app", p)).toBe(true);
  });
  it("unknown pathname keeps the app copy", () => {
    expect(staleNoticeRendersIn("app", null)).toBe(true);
    expect(staleNoticeRendersIn("app", undefined)).toBe(true);
  });
});
