// With localePrefix "as-needed", Spanish (default) routes are unprefixed
// and English routes keep the /en prefix.
export function localeHref(locale: string, path: string): string {
  if (locale === "es") return path || "/";
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export function loginHref(locale: string): string {
  const next = encodeURIComponent(localeHref(locale, "/app"));
  return `${localeHref(locale, "/auth/login")}?next=${next}`;
}
