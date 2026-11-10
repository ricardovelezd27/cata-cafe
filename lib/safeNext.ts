// The ONE validator for `next` params used as a redirect target (S8-06,
// F-entrar-7). Pure and dependency-free so it is unit tested.
//
// Accepts a same-site path ("/es/app/x?y=1#z") or an ABSOLUTE URL whose
// origin equals `origin` (the Supabase email template sends {{ .RedirectTo }},
// which is absolute). Returns path + search + hash, or `fallback`.
//
// Rejects: scheme-relative ("//x"), backslash forms ("/\x"), control chars,
// userinfo / "@" in the path, encoded slash/backslash tricks ("/%2fx",
// "/%5cx"), any other origin, and auth plumbing targets that would loop
// (/auth/callback, /auth/confirm, /auth/login). "/auth/claim" is allowed: the
// guest-claim chain legitimately uses it as a login `next`.

const LOOP_TARGETS = /^(?:\/(?:es|en))?\/auth\/(?:callback|confirm|login)(?:[/?#]|$)/;

export function safeNext(
  input: string | null | undefined,
  opts: { origin?: string; fallback: string },
): string;
export function safeNext(
  input: string | null | undefined,
  opts?: { origin?: string; fallback?: null },
): string | null;
export function safeNext(
  input: string | null | undefined,
  opts: { origin?: string; fallback?: string | null } = {},
): string | null {
  const fallback = opts.fallback ?? null;
  if (!input || typeof input !== "string") return fallback;
  if (/[\u0000-\u001f\u007f]/.test(input) || input.includes("\\")) return fallback;

  let path = input;
  if (!input.startsWith("/")) {
    // Only an absolute URL on OUR origin may pass; everything else is dropped.
    if (!opts.origin || !/^https?:\/\//i.test(input)) return fallback;
    try {
      const url = new URL(input);
      if (url.origin !== new URL(opts.origin).origin) return fallback;
      if (url.username || url.password) return fallback;
      path = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }

  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  const pathOnly = path.split(/[?#]/, 1)[0];
  if (pathOnly.includes("@")) return fallback;
  // Encoded slash / backslash in the path part can be decoded by a downstream
  // hop into "//host" or "/\host".
  if (/%(?:2f|5c)/i.test(pathOnly)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f]/.test(decoded)) {
    return fallback;
  }
  if (LOOP_TARGETS.test(path)) return fallback;
  return path;
}
