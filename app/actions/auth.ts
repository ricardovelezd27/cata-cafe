"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendMagicLink, defaultNextFor, type MagicLinkResult } from "@/lib/magicLink";
import { trustedRequestOrigin } from "@/lib/requestOrigin";
import { safeNext } from "@/lib/safeNext";
import { mapAuthError, type AuthErrorKey } from "@/lib/authErrors";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";

const CONFIRM_TYPES: readonly EmailOtpType[] = [
  "email",
  "magiclink",
  "signup",
  "email_change",
  "recovery",
];

function localeOf(value: string | undefined): "es" | "en" {
  return value === "en" ? "en" : "es";
}

export async function signInWithGoogle(next?: string, locale?: string) {
  // Never trust the Origin header for a redirect target (S8-03, F-entrar-6).
  const origin = await trustedRequestOrigin();
  const dest = safeNext(next, { fallback: defaultNextFor(localeOf(locale)) });
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(dest)}`;

  // TODO(native): in the Capacitor shell pass skipBrowserRedirect: true, open data.url
  // with openExternal() (lib/platform/external.ts) and return via appUrlOpen -> routeFromUrl().
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });

  if (error || !data.url) {
    return { ok: false as const, error: mapAuthError(error?.code ?? error?.message ?? "unknown") };
  }
  redirect(data.url);
}

export async function signInWithMagicLink(
  formData: FormData,
  next?: string,
  locale?: string,
): Promise<MagicLinkResult> {
  return sendMagicLink(String(formData.get("email") || ""), { next, locale });
}

/**
 * Signs in with the 6-digit code from the same email as the link (S8-06,
 * F-entrar-1). Works when the link was consumed by a mail scanner or opened in
 * the wrong browser. The code is checked server-side by Supabase; nothing is
 * stored here. On success the client navigates to `next`.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  next?: string,
  locale?: string,
): Promise<ActionResult<{ next: string }>> {
  return run("verifyEmailCode", async () => {
    const token = String(code ?? "").replace(/\s+/g, "");
    const address = String(email ?? "").trim();
    if (!/^\d{6}$/.test(token) || !address || address.length > 254) throw new Error("invalid_input");
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ email: address, token, type: "email" });
    if (error) throw new Error(authCodeFor(error));
    return { next: safeNext(next, { fallback: defaultNextFor(localeOf(locale)) }) };
  });
}

/**
 * The "Entrar" button on /auth/confirm (S8-06, F-entrar-1, F-landing-3).
 * Consuming the token needs a POST, so a mail scanner that only GETs the link
 * can never burn it.
 */
export async function confirmEmailToken(
  tokenHash: string,
  type: string,
  next?: string,
  locale?: string,
): Promise<ActionResult<{ next: string }>> {
  return run("confirmEmailToken", async () => {
    const hash = String(tokenHash ?? "");
    if (!hash || hash.length > 512 || !CONFIRM_TYPES.includes(type as EmailOtpType)) {
      throw new Error("invalid_input");
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: hash });
    if (error) throw new Error(authCodeFor(error));
    return { next: safeNext(next, { fallback: defaultNextFor(localeOf(locale)) }) };
  });
}

// verifyOtp failures -> the action error codes that already have copy.
function authCodeFor(error: { code?: string; message?: string }): "invalid_token" | "rate_limited" | "unknown" {
  const key: AuthErrorKey = mapAuthError(error.code ?? error.message);
  if (key === "rate_limited") return "rate_limited";
  if (key === "code_invalid" || key === "link_failed") return "invalid_token";
  return "unknown";
}

export async function signOut(locale?: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(localeOf(locale) === "en" ? "/en" : "/");
}

// Signs out and lands on the login screen (instead of the marketing page
// that plain signOut redirects to), so the user can immediately authenticate
// as a different account. Combined with prompt=select_account above, this
// forces Google's account chooser to appear on mobile.
export async function switchAccount(locale: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}/auth/login`);
}
