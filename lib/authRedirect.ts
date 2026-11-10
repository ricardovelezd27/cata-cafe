// Where a signed-out visitor is sent, and how they come back (S8-06,
// F-entrar-3). Pure. The proxy (first line of defence) and the per-page
// backstops share it, so a deep link survives the login detour either way.

import { safeNext } from "@/lib/safeNext";

const LOCALE_RE = /^\/(es|en)(?=\/|$)/;

/** Login URL that returns to `next` afterwards. `next` is validated; an
 *  unsafe one is dropped (the login page then falls back to /{locale}/app). */
export function loginHref(locale: string, next?: string | null): string {
  const loc = locale === "en" ? "en" : "es";
  const base = `/${loc}/auth/login`;
  const safe = safeNext(next);
  return safe ? `${base}?next=${encodeURIComponent(safe)}` : base;
}

/** For proxy.ts: where to send a signed-out request for `pathname`+`search`,
 *  or null when the path is not under /app (public pages are left alone).
 *  Locale comes from the prefix; the default (es) has none under "as-needed". */
export function signedOutRedirect(pathname: string, search: string): string | null {
  const m = LOCALE_RE.exec(pathname);
  const locale = m?.[1] ?? "es";
  const inner = pathname.replace(LOCALE_RE, "") || "/";
  if (inner !== "/app" && !inner.startsWith("/app/")) return null;
  return loginHref(locale, `${pathname}${search}`);
}
