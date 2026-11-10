import { describe, expect, it } from "vitest";
import { localeSwitchHref } from "@/lib/localeSwitch";

describe("localeSwitchHref", () => {
  it("switches an unprefixed Spanish route to English", () => {
    expect(localeSwitchHref("/app/profile", "", "", "en")).toBe("/en/app/profile");
  });
  it("switches an English route back to unprefixed Spanish", () => {
    expect(localeSwitchHref("/en/app/profile", "", "", "es")).toBe("/app/profile");
  });
  it("handles an explicit /es prefix", () => {
    expect(localeSwitchHref("/es/app/coffees", "", "", "en")).toBe("/en/app/coffees");
  });
  it("keeps query and hash", () => {
    expect(localeSwitchHref("/app/sessions/abc/results", "?tab=tabla", "#top", "en")).toBe(
      "/en/app/sessions/abc/results?tab=tabla#top",
    );
    expect(localeSwitchHref("/en/app", "q=1", "x", "es")).toBe("/app?q=1#x");
  });
  it("handles the roots", () => {
    expect(localeSwitchHref("/", "", "", "en")).toBe("/en");
    expect(localeSwitchHref("/en", "", "", "es")).toBe("/");
  });
});
