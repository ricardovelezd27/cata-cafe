import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  decorateGroupMail,
  isWellFormedUnsubscribeToken,
  mintUnsubscribeToken,
  unsubscribeUrl,
} from "@/lib/groupUnsubscribe";

describe("isWellFormedUnsubscribeToken", () => {
  const gid = "cmabcdefghij0123456789klm"; // 25 chars, cuid shape
  const good = mintUnsubscribeToken(gid, "a@b.co", "s");
  const mac = good.split(".")[1];
  it("accepts a minted token", () => {
    expect(gid).toHaveLength(25);
    expect(isWellFormedUnsubscribeToken(good)).toBe(true);
  });
  it("rejects wrong lengths, bad characters, empty and extra segments", () => {
    expect(isWellFormedUnsubscribeToken(`${gid}.${mac.slice(1)}`)).toBe(false);
    expect(isWellFormedUnsubscribeToken(`${gid}.${mac}a`)).toBe(false);
    expect(isWellFormedUnsubscribeToken(`${gid.slice(1)}.${mac}`)).toBe(false);
    expect(isWellFormedUnsubscribeToken(`${gid}.${mac.slice(1)}+`)).toBe(false);
    expect(isWellFormedUnsubscribeToken(`${gid.toUpperCase()}.${mac}`)).toBe(false);
    expect(isWellFormedUnsubscribeToken("")).toBe(false);
    expect(isWellFormedUnsubscribeToken(null)).toBe(false);
    expect(isWellFormedUnsubscribeToken(`${good}.x`)).toBe(false);
    expect(isWellFormedUnsubscribeToken(`${gid}${mac}`)).toBe(false);
  });
});

describe("decorateGroupMail", () => {
  const url = unsubscribeUrl("https://cata.example", "g.mac");
  const out = decorateGroupMail({ html: "<div><p>hi</p></div>", locale: "es", unsubUrl: url });
  it("appends the footer exactly once with the unchanged url", () => {
    expect(out.html.split(url).length - 1).toBe(1);
    expect(out.html).toContain(`href="${url}"`);
  });
  it("sets both RFC 8058 headers exactly", () => {
    expect(out.headers).toEqual({
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});

describe("only sanctioned modules call sendEmail(", () => {
  const ALLOWED = new Set([
    "lib/email.ts",
    "lib/closeEmail.ts",
    "lib/groupEmail.ts",
    "lib/reminderEmail.ts",
    "lib/insightsDigestEmail.ts",
    "lib/magicLink.ts",
  ]);
  function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "generated" && name !== "node_modules") walk(p, acc);
      } else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
    }
    return acc;
  }
  it("group mail cannot bypass lib/groupEmail.ts", () => {
    const root = process.cwd();
    const offenders = [...walk(join(root, "app")), ...walk(join(root, "lib"))]
      .map((f) => relative(root, f).replace(/\\/g, "/"))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /\bsendEmail\(/.test(readFileSync(join(root, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
