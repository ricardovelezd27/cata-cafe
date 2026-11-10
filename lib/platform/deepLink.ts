// Universal-link / custom-scheme routing for the native shell (S8-15). Pure:
// the shell's `appUrlOpen` handler will call routeFromUrl(url, siteOrigin) and
// push the returned in-app path. Anything that is not OUR origin and one of the
// three entry families is dropped (returns null) — an open-redirect attempt
// must never become a navigation.
//
// TODO(native): wire App.addListener("appUrlOpen") in the shell; hosting the
// apple-app-site-association / assetlinks files is out of scope here.
import { safeNext } from "@/lib/safeNext";

const ENTRY = /^\/(?:es|en)\/(?:join\/[^/?#]+|auth\/claim|app(?:\/|$|[?#]))/;

export function routeFromUrl(url: string | null | undefined, origin: string): string | null {
  if (!url || typeof url !== "string") return null;
  let target: string;
  try {
    const u = new URL(url);
    if (u.origin !== new URL(origin).origin) return null;
    if (u.username || u.password) return null;
    target = `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
  const path = safeNext(target, { origin, fallback: null });
  if (!path || !ENTRY.test(path)) return null;

  // A nested ?next= must itself be a safe same-site path, or it is dropped.
  const qIdx = path.indexOf("?");
  if (qIdx === -1) return path;
  const hashIdx = path.indexOf("#");
  const search = path.slice(qIdx, hashIdx === -1 ? undefined : hashIdx);
  const hash = hashIdx === -1 ? "" : path.slice(hashIdx);
  const params = new URLSearchParams(search);
  if (params.has("next")) {
    const clean = safeNext(params.get("next"), { origin, fallback: null });
    if (clean) params.set("next", clean);
    else params.delete("next");
  }
  const qs = params.toString();
  return `${path.slice(0, qIdx)}${qs ? `?${qs}` : ""}${hash}`;
}
