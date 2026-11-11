import "server-only";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { reserveEmailBudget } from "@/lib/emailBudget";
import { trustedRequestOrigin } from "@/lib/requestOrigin";
import { parseClientIp } from "@/lib/requestIp";
import { safeNext } from "@/lib/safeNext";
import { mapAuthError, type AuthErrorKey } from "@/lib/authErrors";

// The ONE place a sign-in link is requested (S8-03, F-entrar-6): the login
// form (signInWithMagicLink) and the founding-seat signup (reserveFoundingSeat)
// both come through here, so one send burns exactly one reservation. The
// address is never logged.

export type MagicLinkResult =
  | { ok: true }
  | { ok: false; error: AuthErrorKey; retryAfterMs?: number };

export function defaultNextFor(locale: string | undefined): string {
  return locale === "en" ? "/en/app" : "/es/app";
}

/**
 * @param beforeSend runs after the budget check passes and before the link is
 *   requested (the waitlist records its entry here, so a throttled request
 *   writes nothing).
 */
export async function sendMagicLink(
  rawEmail: string,
  opts: { next?: string; locale?: string },
  beforeSend?: () => Promise<void>,
): Promise<MagicLinkResult> {
  const email = rawEmail.trim();
  if (!email) return { ok: false, error: "invalid_email" };
  if (email.length > 254) return { ok: false, error: "invalid_email" };

  const locale = opts.locale === "en" ? "en" : "es";
  const h = await headers();
  const ip = parseClientIp(h.get("x-forwarded-for"));
  const supabase = await createClient();
  // Only used to key the per-account bucket (S8-28 A-04); no session = anonymous.
  const userId = await supabase.auth
    .getUser()
    .then((r) => r.data.user?.id ?? null)
    .catch(() => null);
  const budget = await reserveEmailBudget({ kind: "magic_link", ip, email, userId });
  if (!budget.allowed) {
    return { ok: false, error: "rate_limited", retryAfterMs: budget.retryAfterMs };
  }

  if (beforeSend) await beforeSend();

  // Point at the FINAL destination (not /auth/callback). The Supabase "Magic
  // Link" email template appends this as `next` via {{ .RedirectTo }}, and
  // /auth/confirm shows a button whose action verifies the token_hash and lands
  // here (a bare GET never consumes it). The token_hash flow is stateless, so
  // it works even when the email link opens in a different browser or an in-app
  // webview (where PKCE code exchange fails); the 6-digit code is the other way in.
  const origin = await trustedRequestOrigin();
  const redirectTo = `${origin}${safeNext(opts.next, { fallback: defaultNextFor(locale) })}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      // Becomes profiles.preferredLang through handle_new_user() and picks the
      // language of the email templates. Supabase only applies `data` when the
      // user is CREATED: an existing account keeps the language it already has.
      data: { preferred_lang: locale },
    },
  });

  if (error) return { ok: false, error: mapAuthError(error.code ?? error.message) };
  return { ok: true };
}
