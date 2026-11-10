// Which origin a magic link may point back to (S8-03, F-entrar-6).
//
// The `Origin` / `Host` request headers are attacker-influenced: a forged one
// would make the branded sign-in email link to a foreign host. Pure so the
// rule is unit-tested; the caller supplies the environment.

export type TrustedOriginInput = {
  /** Origin derived from the request headers (may be forged). */
  requestOrigin: string;
  /** The configured public site origin (NEXT_PUBLIC_SITE_URL, no trailing slash). */
  siteOrigin: string;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  /** Hosts of this deployment (VERCEL_URL, VERCEL_BRANCH_URL); scheme optional. */
  vercelUrls: ReadonlyArray<string | undefined>;
};

function parse(origin: string): URL | null {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function hostOf(value: string): string {
  const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
  return parse(withScheme)?.host.toLowerCase() ?? "";
}

/** `requestOrigin` when it is the site itself, a local dev host (outside
 *  production) or this Vercel preview deployment; otherwise `siteOrigin`. */
export function pickTrustedOrigin(input: TrustedOriginInput): string {
  const site = stripTrailingSlash(input.siteOrigin);
  const req = parse(input.requestOrigin);
  if (!req || (req.protocol !== "https:" && req.protocol !== "http:")) return site;
  const reqOrigin = stripTrailingSlash(req.origin);

  if (reqOrigin === site) return reqOrigin;

  if (input.nodeEnv !== "production") {
    const host = req.hostname;
    if (host === "localhost" || host === "127.0.0.1") return reqOrigin;
  }

  if (input.vercelEnv === "preview") {
    const reqHost = req.host.toLowerCase();
    const allowed = input.vercelUrls.filter((u): u is string => !!u).map(hostOf);
    if (allowed.includes(reqHost)) return reqOrigin;
  }

  return site;
}

/** A same-site path: starts with one "/" and is not protocol-relative ("//host")
 *  or a backslash trick. Anything else falls back to the default destination. */
export function safeNextPath(next: string | undefined | null, fallback: string): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
