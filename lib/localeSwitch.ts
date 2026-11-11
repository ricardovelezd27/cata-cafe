// URL of the SAME page in another language (S8-06, F-cuenta-3). Pure.
//
// With localePrefix "as-needed" the default language (es) has NO prefix in the
// address bar ("/app/profile") while en keeps "/en/app/profile", so the old
// `pathname.replace("/es/", "/en/")` was a no-op on every Spanish route. The
// query string and hash are kept so a filtered list or an anchor survives.

import { stripLocale } from "@/lib/guestScope";

export type SwitchLocale = "es" | "en";

export function localeSwitchHref(
  pathname: string,
  search: string,
  hash: string,
  target: SwitchLocale,
): string {
  const inner = stripLocale(pathname || "/");
  const path = target === "es" ? inner : inner === "/" ? "/en" : `/en${inner}`;
  const q = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  const h = hash && hash !== "#" ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${path}${q}${h}`;
}
