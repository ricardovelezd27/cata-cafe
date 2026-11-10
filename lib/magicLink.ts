import "server-only";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { reserveEmailBudget } from "@/lib/emailBudget";
import { trustedRequestOrigin } from "@/lib/requestOrigin";
import { parseClientIp } from "@/lib/requestIp";
import { safeNextPath } from "@/lib/trustedOrigin";

// The ONE place a sign-in link is requested (S8-03, F-entrar-6): the login
// form (signInWithMagicLink) and the founding-seat signup (reserveFoundingSeat)
// both come through here, so one send burns exactly one reservation. The
// address is never logged.

export type MagicLinkResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterMs?: number };

const DEFAULT_NEXT = "/es/app";

/**
 * @param beforeSend runs after the budget check passes and before the link is
 *   requested (the waitlist records its entry here, so a throttled request
 *   writes nothing).
 */
export async function sendMagicLink(
  rawEmail: string,
  next: string | undefined,
  beforeSend?: () => Promise<void>,
): Promise<MagicLinkResult> {
  const email = rawEmail.trim();
  if (!email) return { ok: false, error: "missing_email" };
  if (email.length > 254) return { ok: false, error: "invalid_email" };

  const h = await headers();
  const ip = parseClientIp(h.get("x-forwarded-for"));
  const budget = await reserveEmailBudget({ kind: "magic_link", ip, email });
  if (!budget.allowed) {
    return { ok: false, error: "rate_limited", retryAfterMs: budget.retryAfterMs };
  }

  if (beforeSend) await beforeSend();

  // Point at the FINAL destination (not /auth/callback). The Supabase "Magic
  // Link" email template appends this as `next` via {{ .RedirectTo }}, and
  // /auth/callback verifies the token_hash then redirects here. This token_hash
  // flow is stateless, so it works even when the email link opens in a
  // different browser or an in-app webview (where PKCE code exchange fails).
  const origin = await trustedRequestOrigin();
  const redirectTo = `${origin}${safeNextPath(next, DEFAULT_NEXT)}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) return { ok: false, error: error.code ?? error.message };
  return { ok: true };
}
