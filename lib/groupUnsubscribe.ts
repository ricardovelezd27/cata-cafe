import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Per-group email unsubscribe (S8-20, F-grupos-8): the signed token, the link
 * and headers every group mail carries, and the footer. No Prisma and no
 * `server-only`, so vitest covers it (tests/groupUnsubscribe.test.ts).
 *
 * The token is `<groupId>.<mac>` where mac = HMAC(secret, "group-unsubscribe:" +
 * groupId + ":" + normalized email). The address itself is NOT in the token
 * (no readable PII in a URL, a log or a forwarded mail); the route looks the
 * member up by recomputing the mac for each stored address of that group
 * (groups are capped at 200). No expiry: an unsubscribe link must keep working
 * for as long as the mail exists. It can only ever switch mail OFF.
 */

function envSecret(): string {
  const s = process.env.GUEST_CLAIM_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("guest_claim_secret_missing");
  return s;
}

export function normalizeUnsubscribeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function macFor(secret: string, groupId: string, email: string): string {
  return createHmac("sha256", secret)
    .update(`group-unsubscribe:${groupId}:${normalizeUnsubscribeEmail(email)}`)
    .digest("base64url");
}

export function mintUnsubscribeToken(groupId: string, email: string, secret: string = envSecret()): string {
  return `${groupId}.${macFor(secret, groupId, email)}`;
}

/** Splits a token WITHOUT trusting it. Null when malformed. */
export function parseUnsubscribeToken(token: string): { groupId: string; mac: string } | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0 || i === token.length - 1) return null;
  const groupId = token.slice(0, i);
  const mac = token.slice(i + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(groupId) || !/^[A-Za-z0-9_-]+$/.test(mac)) return null;
  return { groupId, mac };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** True when `token` is the genuine token for exactly this group and address. */
export function tokenMatches(
  token: string,
  groupId: string,
  email: string,
  secret: string = envSecret(),
): boolean {
  const parsed = parseUnsubscribeToken(token);
  if (!parsed || parsed.groupId !== groupId) return false;
  return safeEqual(parsed.mac, macFor(secret, groupId, email));
}

/**
 * Given a token and the stored addresses of that token's group, the addresses
 * the token belongs to (normally one). Empty for a tampered token or a group
 * the token does not name; the caller answers both the same way.
 */
export function addressesForToken(
  token: string,
  groupId: string,
  candidateEmails: readonly string[],
  secret: string = envSecret(),
): string[] {
  return candidateEmails.filter((e) => tokenMatches(token, groupId, e, secret));
}

/** Absolute unsubscribe URL. `origin` is siteOrigin(), never a request header. */
export function unsubscribeUrl(origin: string, token: string): string {
  return `${origin}/api/groups/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** RFC 8058 one-click headers. */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

const FOOTER = {
  es: "Darte de baja de los correos de este grupo",
  en: "Unsubscribe from this group's emails",
} as const;

/** Footer block appended to every group mail. `url` is already safe ASCII. */
export function unsubscribeFooterHtml(locale: "es" | "en", url: string): string {
  return `<p style="color:#7a7168; font-size:12px; margin-top:24px;"><a href="${url}" style="color:#7a7168;">${FOOTER[locale === "en" ? "en" : "es"]}</a></p>`;
}

/** What every group mail is sent with: footer link in the body plus the RFC 8058 headers. */
export function decorateGroupMail(args: {
  html: string;
  locale: "es" | "en";
  unsubUrl: string;
}): { html: string; headers: Record<string, string> } {
  return {
    html: withUnsubscribeFooter(args.html, args.locale, args.unsubUrl),
    headers: unsubscribeHeaders(args.unsubUrl),
  };
}

/** Puts the footer before the final closing tag of the template's wrapper, or at the end. */
export function withUnsubscribeFooter(html: string, locale: "es" | "en", url: string): string {
  const footer = unsubscribeFooterHtml(locale, url);
  const i = html.lastIndexOf("</div>");
  return i === -1 ? html + footer : html.slice(0, i) + footer + html.slice(i);
}
