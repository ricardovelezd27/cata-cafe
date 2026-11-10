// In-app browsers (Instagram, Facebook, WhatsApp, Line, TikTok webviews) block
// Google OAuth ("disallowed_useragent"). Pure UA detection (S8-15, F-entrar-8);
// the login form swaps the Google button for an "open in your browser" hint.
//
// TODO(native): in the Capacitor shell, signInWithOAuth({ skipBrowserRedirect: true })
// -> openExternal(url) -> return through appUrlOpen (see app/actions/auth.ts).

export type InAppBrowser = "instagram" | "facebook" | "whatsapp" | "line" | "tiktok";

const PATTERNS: [InAppBrowser, RegExp][] = [
  ["instagram", /\bInstagram\b/i],
  ["facebook", /\bFBAN\b|\bFBAV\b|\bFB_IAB\b|\bFBIOS\b/],
  ["whatsapp", /\bWhatsApp\b/i],
  ["line", /\bLine\/\d/i],
  ["tiktok", /\bBytedanceWebview\b|\bmusical_ly\b|\bTikTok\b/i],
];

export function detectInAppBrowser(ua: string | null | undefined): InAppBrowser | null {
  if (!ua) return null;
  for (const [name, re] of PATTERNS) if (re.test(ua)) return name;
  return null;
}

/** Current document's in-app browser, or null (also on the server). */
export function currentInAppBrowser(): InAppBrowser | null {
  if (typeof navigator === "undefined") return null;
  return detectInAppBrowser(navigator.userAgent);
}
