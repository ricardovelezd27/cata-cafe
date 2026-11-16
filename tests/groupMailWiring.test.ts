import { describe, expect, it } from "vitest";
import { confirmPage } from "@/lib/groupUnsubscribePage";
import {
  decorateGroupMail,
  isWellFormedUnsubscribeToken,
  mintUnsubscribeToken,
  unsubscribeUrl,
} from "@/lib/groupUnsubscribe";
import { SCAN_TIMEOUT_MS, readSource, walkSource } from "./helpers/sourceTree";

describe("confirm page escaping", () => {
  it("escapes quotes and angle brackets in the group name", () => {
    const html = confirmPage("en", `A"B'<script>&`, "tok");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;");
    expect(html).toContain("&#39;");
    expect(html).toContain("&lt;script&gt;&amp;");
  });
});

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
  const walk = (dir: string) =>
    walkSource(dir, "groupMailWiring", {
      skip: (name, isDirectory) => isDirectory && (name === "generated" || name === "node_modules"),
      include: /\.(ts|tsx)$/,
    });
  it("group mail cannot bypass lib/groupEmail.ts", () => {
    const offenders = [...walk("app"), ...walk("lib")]
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /\bsendEmail\(/.test(readSource(f)));
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT_MS); // reads every file under app and lib: a full run slows that about tenfold
});
