import { describe, expect, it } from "vitest";
import { maskEmail, memberLabel } from "@/lib/maskEmail";

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("juan@cafe.com")).toBe("j***@cafe.com");
  });
  it("hides everything when there is no usable local part", () => {
    expect(maskEmail("")).toBe("***");
    expect(maskEmail("@cafe.com")).toBe("***");
    expect(maskEmail("not-an-address")).toBe("***");
  });
  it("never returns the full local part", () => {
    expect(maskEmail("longname@x.co")).not.toContain("longname");
  });
});

describe("memberLabel", () => {
  it("prefers the display name", () => {
    expect(memberLabel({ displayName: "  Ana  ", email: "ana@x.co", userId: "u1" })).toBe("Ana");
  });
  it("a linked member without a name exposes only the first letter, no domain", () => {
    const label = memberLabel({ displayName: null, email: "juan@private.org", userId: "u1" });
    expect(label).toBe("j***");
    expect(label).not.toContain("@");
    expect(label).not.toContain("private");
  });
  it("an email-only invitee keeps the masked address", () => {
    expect(memberLabel({ displayName: "", email: "juan@cafe.com", userId: null })).toBe("j***@cafe.com");
  });
  it("blank linked address degrades to ***", () => {
    expect(memberLabel({ email: " ", userId: "u1" })).toBe("***");
  });
});
