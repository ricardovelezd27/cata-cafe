import { describe, expect, it } from "vitest";
import { routeFromUrl } from "@/lib/platform/deepLink";

const O = "https://cafesensible.ai";

describe("routeFromUrl", () => {
  it("maps the three entry families", () => {
    expect(routeFromUrl(`${O}/es/join/abc-123`, O)).toBe("/es/join/abc-123");
    expect(routeFromUrl(`${O}/en/auth/claim?token=t.k`, O)).toBe("/en/auth/claim?token=t.k");
    expect(routeFromUrl(`${O}/es/app`, O)).toBe("/es/app");
    expect(routeFromUrl(`${O}/es/app/sessions/1/results?x=1#a`, O)).toBe("/es/app/sessions/1/results?x=1#a");
  });

  it("keeps a safe nested ?next=", () => {
    expect(routeFromUrl(`${O}/es/auth/claim?next=%2Fes%2Fapp%2Fsessions`, O)).toBe(
      "/es/auth/claim?next=%2Fes%2Fapp%2Fsessions",
    );
  });

  it("drops an unsafe nested ?next= (open redirect)", () => {
    expect(routeFromUrl(`${O}/es/auth/claim?token=a&next=https%3A%2F%2Fevil.com`, O)).toBe(
      "/es/auth/claim?token=a",
    );
    expect(routeFromUrl(`${O}/es/auth/claim?next=%2F%2Fevil.com`, O)).toBe("/es/auth/claim");
  });

  it("rejects other origins, userinfo, schemes and non-entry paths", () => {
    expect(routeFromUrl("https://evil.com/es/app", O)).toBeNull();
    expect(routeFromUrl("https://cafesensible.ai.evil.com/es/app", O)).toBeNull();
    expect(routeFromUrl("https://user:pw@cafesensible.ai/es/app", O)).toBeNull();
    expect(routeFromUrl("javascript:alert(1)", O)).toBeNull();
    expect(routeFromUrl(`${O}/es/auth/login`, O)).toBeNull();
    expect(routeFromUrl(`${O}/es/auth/callback?code=1`, O)).toBeNull();
    expect(routeFromUrl(`${O}/es/api/x`, O)).toBeNull();
    expect(routeFromUrl(`${O}//evil.com/es/app`, O)).toBeNull();
    expect(routeFromUrl(`${O}/es/application`, O)).toBeNull();
    expect(routeFromUrl("", O)).toBeNull();
    expect(routeFromUrl(null, O)).toBeNull();
  });
});
