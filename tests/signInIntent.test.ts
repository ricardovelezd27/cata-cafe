import { describe, expect, it } from "vitest";
import {
  SIGNIN_INTENT_MAX_ENTRIES,
  decideSignInIntent,
  intentMac,
  mintIntentValue,
  parseIntentValue,
} from "@/lib/signInIntent";

const S = "test-secret";

describe("sign-in intent (A-08)", () => {
  it("matches the address the browser asked a link for", () => {
    const c = mintIntentValue(S, ["ana@example.com"]);
    expect(decideSignInIntent(S, c, "ana@example.com")).toBe("match");
  });

  it("normalizes case and whitespace on both sides", () => {
    const c = mintIntentValue(S, ["  Ana@Example.COM "]);
    expect(decideSignInIntent(S, c, "ana@example.com")).toBe("match");
    expect(decideSignInIntent(S, mintIntentValue(S, ["ana@example.com"]), " ANA@example.com ")).toBe("match");
  });

  it("asks for confirmation on a different address", () => {
    const c = mintIntentValue(S, ["ana@example.com"]);
    expect(decideSignInIntent(S, c, "attacker@example.com")).toBe("confirm");
  });

  it("asks for confirmation without a cookie", () => {
    expect(decideSignInIntent(S, undefined, "ana@example.com")).toBe("confirm");
    expect(decideSignInIntent(S, null, "ana@example.com")).toBe("confirm");
    expect(decideSignInIntent(S, "", "ana@example.com")).toBe("confirm");
  });

  it("asks for confirmation on a malformed cookie", () => {
    expect(decideSignInIntent(S, "garbage", "ana@example.com")).toBe("confirm");
    expect(decideSignInIntent(S, "a.b.c", "ana@example.com")).toBe("confirm");
    expect(decideSignInIntent(S, "x".repeat(500), "ana@example.com")).toBe("confirm");
  });

  it("asks for confirmation when the user has no address", () => {
    const c = mintIntentValue(S, ["ana@example.com"]);
    expect(decideSignInIntent(S, c, null)).toBe("confirm");
    expect(decideSignInIntent(S, c, "")).toBe("confirm");
  });

  it("a cookie minted under another secret never matches", () => {
    const c = mintIntentValue("other", ["ana@example.com"]);
    expect(decideSignInIntent(S, c, "ana@example.com")).toBe("confirm");
  });

  it("never contains the address", () => {
    expect(mintIntentValue(S, ["ana@example.com"])).not.toMatch(/ana|example/);
  });

  it("remembers several addresses and drops the oldest past the cap", () => {
    let c = "";
    const all = ["a@x.co", "b@x.co", "c@x.co", "d@x.co"];
    for (const e of all) c = mintIntentValue(S, [e], c);
    expect(parseIntentValue(c)).toHaveLength(SIGNIN_INTENT_MAX_ENTRIES);
    expect(decideSignInIntent(S, c, "a@x.co")).toBe("confirm");
    expect(decideSignInIntent(S, c, "b@x.co")).toBe("match");
    expect(decideSignInIntent(S, c, "d@x.co")).toBe("match");
  });

  it("re-requesting an address does not duplicate it", () => {
    const c1 = mintIntentValue(S, ["a@x.co"]);
    const c2 = mintIntentValue(S, ["A@x.co"], c1);
    expect(parseIntentValue(c2)).toEqual([intentMac(S, "a@x.co")]);
  });

  it("ignores a malformed previous value when minting", () => {
    const c = mintIntentValue(S, ["a@x.co"], "junk.value");
    expect(parseIntentValue(c)).toEqual([intentMac(S, "a@x.co")]);
  });
});

describe("decision feeds the A-08 redesign", () => {
  it("only an exact match lets the browser session be established", () => {
    const c = mintIntentValue(S, ["ana@example.com"]);
    // "match" -> setSession; anything else -> pending cookie + full-address card.
    expect(decideSignInIntent(S, c, "ana@example.com")).toBe("match");
    // The old masked card was defeated by same first letter + domain; the
    // decision itself never depended on the mask.
    expect(decideSignInIntent(S, c, "a.attacker@example.com")).toBe("confirm");
    expect(decideSignInIntent(S, c, null)).toBe("confirm");
  });

  it("a different secret never matches", () => {
    const c = mintIntentValue(S, ["ana@example.com"]);
    expect(decideSignInIntent("other-secret", c, "ana@example.com")).toBe("confirm");
  });
});
