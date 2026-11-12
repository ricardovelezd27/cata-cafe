import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addressesForToken,
  mintUnsubscribeToken,
  parseUnsubscribeToken,
  tokenMatches,
  unsubscribeFooterHtml,
  unsubscribeHeaders,
  unsubscribeUrl,
  withUnsubscribeFooter,
} from "@/lib/groupUnsubscribe";
import { confirmPage, invalidPage, localeFromAcceptLanguage } from "@/lib/groupUnsubscribePage";

const S = "test-secret";
const G = "cmgroup123";

describe("group unsubscribe token", () => {
  it("round trips", () => {
    const t = mintUnsubscribeToken(G, "ana@example.com", S);
    expect(tokenMatches(t, G, "ana@example.com", S)).toBe(true);
    expect(parseUnsubscribeToken(t)?.groupId).toBe(G);
  });
  it("does not carry the address", () => {
    expect(mintUnsubscribeToken(G, "ana@example.com", S)).not.toMatch(/ana|example/);
  });
  it("ignores address case and whitespace", () => {
    const t = mintUnsubscribeToken(G, "Ana@Example.com ", S);
    expect(tokenMatches(t, G, "ana@example.com", S)).toBe(true);
  });
  it("rejects a tampered token", () => {
    const t = mintUnsubscribeToken(G, "ana@example.com", S);
    expect(tokenMatches(t.slice(0, -2) + "xx", G, "ana@example.com", S)).toBe(false);
    expect(tokenMatches("garbage", G, "ana@example.com", S)).toBe(false);
  });
  it("rejects another group, another address, another secret", () => {
    const t = mintUnsubscribeToken(G, "ana@example.com", S);
    expect(tokenMatches(t, "othergroup", "ana@example.com", S)).toBe(false);
    expect(tokenMatches(t, G, "bob@example.com", S)).toBe(false);
    expect(tokenMatches(t, G, "ana@example.com", "other")).toBe(false);
  });
  it("finds the matching stored address only", () => {
    const t = mintUnsubscribeToken(G, "bob@example.com", S);
    expect(addressesForToken(t, G, ["ana@example.com", "bob@example.com"], S)).toEqual(["bob@example.com"]);
    expect(addressesForToken(t, "x", ["bob@example.com"], S)).toEqual([]);
  });
  it("parse refuses malformed input", () => {
    for (const bad of ["", ".", "a.", ".b", "a b.c", "x".repeat(300)]) {
      expect(parseUnsubscribeToken(bad)).toBeNull();
    }
  });
});

describe("unsubscribe link, headers and footer", () => {
  const url = unsubscribeUrl("https://cafe.example", "g.m_a-c");
  it("builds the link and the RFC 8058 headers", () => {
    expect(url).toBe("https://cafe.example/api/groups/unsubscribe?token=g.m_a-c");
    expect(unsubscribeHeaders(url)).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
  it("adds a localized footer inside the wrapper", () => {
    expect(unsubscribeFooterHtml("en", url)).toContain("Unsubscribe");
    const out = withUnsubscribeFooter("<div><p>hola</p></div>", "es", url);
    expect(out).toBe(`<div><p>hola</p>${unsubscribeFooterHtml("es", url)}</div>`);
    expect(withUnsubscribeFooter("plain", "es", url).endsWith("</p>")).toBe(true);
  });
});

describe("unsubscribe pages", () => {
  it("escapes the group name and posts back with the token", () => {
    const html = confirmPage("es", '<script>"x"</script>', "g.m");
    expect(html).not.toContain("<script>");
    expect(html).toContain('action="/api/groups/unsubscribe?token=g.m"');
  });
  it("picks the language from Accept-Language, es by default", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("es");
    expect(invalidPage("en")).toContain("not valid");
  });
});

describe("versioned unsubscribe secret (A-11)", () => {
  afterEach(() => vi.unstubAllEnvs());

  function env(legacy: string | undefined, dedicated: string | undefined) {
    vi.stubEnv("GUEST_CLAIM_SECRET", legacy ?? "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("UNSUBSCRIBE_SECRET", dedicated ?? "");
  }

  it("mints with the new secret when set, and that token verifies", () => {
    env("legacy-s", "new-s");
    const t = mintUnsubscribeToken(G, "ana@example.com");
    expect(t).toBe(mintUnsubscribeToken(G, "ana@example.com", "new-s"));
    expect(tokenMatches(t, G, "ana@example.com")).toBe(true);
  });

  it("a token signed with the legacy secret still verifies once a new one is set", () => {
    const legacyToken = mintUnsubscribeToken(G, "ana@example.com", "legacy-s");
    env("legacy-s", "new-s");
    expect(tokenMatches(legacyToken, G, "ana@example.com")).toBe(true);
    expect(addressesForToken(legacyToken, G, ["ana@example.com", "bob@example.com"])).toEqual(["ana@example.com"]);
  });

  it("a token signed with an unrelated secret fails", () => {
    env("legacy-s", "new-s");
    const bad = mintUnsubscribeToken(G, "ana@example.com", "unrelated");
    expect(tokenMatches(bad, G, "ana@example.com")).toBe(false);
    expect(addressesForToken(bad, G, ["ana@example.com"])).toEqual([]);
  });

  it("without UNSUBSCRIBE_SECRET behaviour is unchanged (legacy mints and verifies)", () => {
    env("legacy-s", undefined);
    const t = mintUnsubscribeToken(G, "ana@example.com");
    expect(t).toBe(mintUnsubscribeToken(G, "ana@example.com", "legacy-s"));
    expect(tokenMatches(t, G, "ana@example.com")).toBe(true);
    expect(tokenMatches(mintUnsubscribeToken(G, "ana@example.com", "new-s"), G, "ana@example.com")).toBe(false);
  });

  it("falls back to the service-role key when GUEST_CLAIM_SECRET is unset", () => {
    vi.stubEnv("GUEST_CLAIM_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "srk");
    vi.stubEnv("UNSUBSCRIBE_SECRET", "");
    expect(mintUnsubscribeToken(G, "a@b.co")).toBe(mintUnsubscribeToken(G, "a@b.co", "srk"));
  });
});
