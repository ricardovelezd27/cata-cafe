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

// Secrets (S9-02, A-11). Unsubscribe links never expire, so the secret that
// signed them must never be rotated out from under mailed links:
//  - MINT uses UNSUBSCRIBE_SECRET when set, else the legacy secret
//    (GUEST_CLAIM_SECRET, falling back to the service-role key).
//  - VERIFY accepts a token signed with EITHER, so links mailed before
//    UNSUBSCRIBE_SECRET was set keep working. Once set, never remove or change
//    it without keeping the old value as the legacy one (runbook §3 / §25).
function legacySecret(): string | undefined {
  return process.env.GUEST_CLAIM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

function dedicatedSecret(): string | undefined {
  return process.env.UNSUBSCRIBE_SECRET?.trim() || undefined;
}

function mintSecret(): string {
  const s = dedicatedSecret() ?? legacySecret();
  if (!s) throw new Error("guest_claim_secret_missing");
  return s;
}

/** Every secret a token may have been signed with, newest first. */
function verifySecrets(): string[] {
  const all = [dedicatedSecret(), legacySecret()].filter((s): s is string => !!s);
  if (all.length === 0) throw new Error("guest_claim_secret_missing");
  return Array.from(new Set(all));
}

export function normalizeUnsubscribeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function macFor(secret: string, groupId: string, email: string): string {
  return createHmac("sha256", secret)
    .update(`group-unsubscribe:${groupId}:${normalizeUnsubscribeEmail(email)}`)
    .digest("base64url");
}

export function mintUnsubscribeToken(groupId: string, email: string, secret: string = mintSecret()): string {
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

// Prisma cuid() ids (25 chars, "c" + 24 base36) and a base64url SHA-256 MAC
// (43 chars, no padding). Checked by the route BEFORE any database query.
const GROUP_ID_RE = /^c[a-z0-9]{24}$/;
const MAC_RE = /^[A-Za-z0-9_-]{43}$/;

/** True only for a token shaped like one we mint. Pure; no secret needed. */
export function isWellFormedUnsubscribeToken(token: unknown): token is string {
  if (typeof token !== "string" || token.length > 200) return false;
  const parts = token.split(".");
  return parts.length === 2 && GROUP_ID_RE.test(parts[0]) && MAC_RE.test(parts[1]);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * True when `token` is the genuine token for exactly this group and address,
 * signed with any accepted secret (default: the dedicated one AND the legacy
 * one). Every secret is tried (no early exit) and each compare is constant-time.
 */
export function tokenMatches(
  token: string,
  groupId: string,
  email: string,
  secret: string | readonly string[] = verifySecrets(),
): boolean {
  const parsed = parseUnsubscribeToken(token);
  if (!parsed || parsed.groupId !== groupId) return false;
  const secrets = typeof secret === "string" ? [secret] : secret;
  let ok = false;
  for (const s of secrets) {
    if (safeEqual(parsed.mac, macFor(s, groupId, email))) ok = true;
  }
  return ok;
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
  secret: string | readonly string[] = verifySecrets(),
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
