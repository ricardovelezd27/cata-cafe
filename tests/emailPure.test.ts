import { describe, expect, it } from "vitest";
import { pickTrustedOrigin, safeNextPath } from "@/lib/trustedOrigin";
import { parseClientIp } from "@/lib/requestIp";
import { maskEmail } from "@/lib/maskEmail";
import {
  GROUP_BROADCASTS_PER_HOUR,
  GROUP_RECIPIENTS_PER_DAY,
  GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT,
  MAGIC_LINK_PER_ADDRESS,
  MAGIC_LINK_PER_IP,
  MAX_WINDOW_MS,
  NEW_ACCOUNT_AGE_MS,
  groupRecipientRule,
} from "@/lib/emailLimits";

const SITE = "https://app.example.com";
const base = {
  siteOrigin: SITE,
  nodeEnv: "production" as string | undefined,
  vercelEnv: "production" as string | undefined,
  vercelUrls: [] as Array<string | undefined>,
};

describe("pickTrustedOrigin", () => {
  it("accepts the site origin itself", () => {
    expect(pickTrustedOrigin({ ...base, requestOrigin: SITE })).toBe(SITE);
    expect(pickTrustedOrigin({ ...base, siteOrigin: `${SITE}/`, requestOrigin: SITE })).toBe(SITE);
  });
  it("replaces a foreign origin with the site origin in production", () => {
    expect(pickTrustedOrigin({ ...base, requestOrigin: "https://evil.example" })).toBe(SITE);
    expect(pickTrustedOrigin({ ...base, requestOrigin: "http://localhost:3000" })).toBe(SITE);
  });
  it("allows localhost only outside production", () => {
    const dev = { ...base, nodeEnv: "development", vercelEnv: undefined };
    expect(pickTrustedOrigin({ ...dev, requestOrigin: "http://localhost:3001" })).toBe(
      "http://localhost:3001",
    );
    expect(pickTrustedOrigin({ ...dev, requestOrigin: "http://127.0.0.1:3000" })).toBe(
      "http://127.0.0.1:3000",
    );
    expect(pickTrustedOrigin({ ...dev, requestOrigin: "http://localhost.evil.example" })).toBe(SITE);
  });
  it("allows this Vercel preview deployment only", () => {
    const prev = {
      ...base,
      vercelEnv: "preview",
      vercelUrls: ["cata-git-x-team.vercel.app", undefined],
    };
    expect(pickTrustedOrigin({ ...prev, requestOrigin: "https://cata-git-x-team.vercel.app" })).toBe(
      "https://cata-git-x-team.vercel.app",
    );
    expect(pickTrustedOrigin({ ...prev, requestOrigin: "https://other.vercel.app" })).toBe(SITE);
    expect(
      pickTrustedOrigin({
        ...prev,
        vercelEnv: "production",
        requestOrigin: "https://cata-git-x-team.vercel.app",
      }),
    ).toBe(SITE);
  });
  it("falls back on garbage and non-http schemes", () => {
    expect(pickTrustedOrigin({ ...base, requestOrigin: "not a url" })).toBe(SITE);
    expect(pickTrustedOrigin({ ...base, requestOrigin: "javascript://x" })).toBe(SITE);
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/es/app/sessions", "/es/app")).toBe("/es/app/sessions");
  });
  it("rejects host-changing and malformed destinations", () => {
    for (const bad of ["@evil.com", "//evil.com", "https://evil.com", "/\\evil.com", "", undefined]) {
      expect(safeNextPath(bad, "/es/app")).toBe("/es/app");
    }
  });
});

describe("parseClientIp", () => {
  it("takes the first x-forwarded-for entry, trimmed", () => {
    expect(parseClientIp("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    expect(parseClientIp("  203.0.113.7  ")).toBe("203.0.113.7");
  });
  it("is null when absent or blank", () => {
    expect(parseClientIp(null)).toBeNull();
    expect(parseClientIp(undefined)).toBeNull();
    expect(parseClientIp("")).toBeNull();
    expect(parseClientIp(" , 1.2.3.4")).toBeNull();
  });
});

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("juan@dominio.com")).toBe("j***@dominio.com");
    expect(maskEmail("a@x.com")).toBe("a***@x.com");
  });
  it("never echoes something that is not an address", () => {
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@x.com")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });
});

describe("email limits (constants and recipient rule)", () => {
  const MIN = 60_000;
  it("pins the architect's numbers", () => {
    expect(MAGIC_LINK_PER_ADDRESS).toEqual({ windowMs: 15 * MIN, maxEvents: 3 });
    expect(MAGIC_LINK_PER_IP).toEqual({ windowMs: 15 * MIN, maxEvents: 60 });
    expect(GROUP_BROADCASTS_PER_HOUR).toEqual({ windowMs: 60 * MIN, maxEvents: 3 });
    expect(GROUP_RECIPIENTS_PER_DAY.maxRecipients).toBe(300);
    expect(GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT.maxRecipients).toBe(40);
    expect(NEW_ACCOUNT_AGE_MS).toBe(24 * 60 * MIN);
  });
  it("MAX_WINDOW_MS covers every rule", () => {
    for (const r of [
      MAGIC_LINK_PER_ADDRESS,
      MAGIC_LINK_PER_IP,
      GROUP_BROADCASTS_PER_HOUR,
      GROUP_RECIPIENTS_PER_DAY,
      GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT,
    ]) {
      expect(r.windowMs).toBeLessThanOrEqual(MAX_WINDOW_MS);
    }
  });
  it("uses the stricter daily rule for accounts under 24 h", () => {
    const now = 1_000_000_000_000;
    expect(groupRecipientRule(now - 60 * MIN, now)).toBe(GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT);
    expect(groupRecipientRule(now - NEW_ACCOUNT_AGE_MS, now)).toBe(GROUP_RECIPIENTS_PER_DAY);
    expect(groupRecipientRule(null, now)).toBe(GROUP_RECIPIENTS_PER_DAY);
  });
});
