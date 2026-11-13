// Pure parsing of the two analytics admin environment variables. No imports,
// so it can be unit-tested (lib/analytics/access.ts imports server-only).
//
// There is deliberately NO built-in address: when ANALYTICS_SUPER_ADMIN_EMAIL
// is missing or blank there is no super-admin at all (F-insights-5).

import { email as validateEmail } from "@/lib/validate";

type EnvLike = Record<string, string | undefined>;

/**
 * The super-admin address, trimmed and lowercased. It must be exactly ONE
 * valid address (lib/validate.ts `email` rules, plus no comma): a missing,
 * blank or malformed value (a list, `not-an-email`) is null, so nobody is
 * super-admin and the digest never targets a malformed string.
 */
export function parseSuperAdminEmail(env: EnvLike = process.env): string | null {
  const raw = env.ANALYTICS_SUPER_ADMIN_EMAIL?.trim();
  if (!raw || raw.includes(",")) return null;
  try {
    return validateEmail(raw);
  } catch {
    return null;
  }
}

/** True only for a non-empty address equal to the configured super-admin. */
export function matchesSuperAdmin(
  email: string | null | undefined,
  env: EnvLike = process.env,
): boolean {
  const superEmail = parseSuperAdminEmail(env);
  if (!superEmail || typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  return e.length > 0 && e === superEmail;
}

/**
 * The AI-admin allowlist: ANALYTICS_AI_ADMIN_EMAILS (comma-separated, trimmed,
 * lowercased). Unset or blank falls back to just the super-admin, or to an
 * empty list when there is none.
 */
export function parseAiAdminEmails(env: EnvLike = process.env): string[] {
  const listed = (env.ANALYTICS_AI_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  if (listed.length > 0) return listed;
  const superEmail = parseSuperAdminEmail(env);
  return superEmail ? [superEmail] : [];
}

export function matchesAiAdmin(
  email: string | null | undefined,
  env: EnvLike = process.env,
): boolean {
  if (typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  return e.length > 0 && parseAiAdminEmails(env).includes(e);
}
