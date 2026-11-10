// Pure: the `source` stamped on a waitlist row (S8-08, F-landing-6).
// `variant` comes from the form that was submitted (hero | founding); `src` is
// an optional campaign tag read from ?src= in the browser. Everything is
// validated again on the server: the stored value is either "landing" or
// "<variant>" / "<variant>:<tag>" with a short [a-z0-9_-] tag.

export const WAITLIST_VARIANTS = ["hero", "founding"] as const;
export type WaitlistVariant = (typeof WAITLIST_VARIANTS)[number];

const TAG_RE = /^[a-z0-9_-]{1,24}$/;

export function sanitizeSrcTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return TAG_RE.test(v) ? v : null;
}

export function waitlistSource(variant: unknown, src: unknown): string {
  if (!WAITLIST_VARIANTS.includes(variant as WaitlistVariant)) return "landing";
  const tag = sanitizeSrcTag(src);
  return tag ? `${variant}:${tag}` : String(variant);
}
