"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sendMagicLink, defaultNextFor, type MagicLinkResult } from "@/lib/magicLink";
import { trustedRequestOrigin } from "@/lib/requestOrigin";
import { safeNext } from "@/lib/safeNext";
import { mapAuthError, type AuthErrorKey } from "@/lib/authErrors";
import { run } from "@/lib/safeAction";
import { reserveEmailBudget } from "@/lib/emailBudget";
import { parseClientIp } from "@/lib/requestIp";
import { loginHref } from "@/lib/authRedirect";
import { maskEmail } from "@/lib/maskEmail";
import { checkSignInIntent, clearSignInIntent, rememberSignInIntent } from "@/lib/signInIntentCookie";
import { isRegisteredUser } from "@/lib/guestScope";
import * as v from "@/lib/validate";
import type { ActionResult } from "@/lib/actionResult";

const CONFIRM_TYPES: readonly EmailOtpType[] = [
  "email",
  "magiclink",
  "signup",
  "email_change",
  "recovery",
];

/** Request IP for the email/attempt ledger, or null when unknown. */
async function requestIp(): Promise<string | null> {
  const h = await headers();
  return parseClientIp(h.get("x-forwarded-for"));
}

/** S8-22 A-03/A-04: reserve BEFORE Supabase is called; a refusal is
 *  `rate_limited` (the retry-after value is not part of ActionResult). */
async function reserveOrThrow(req: Parameters<typeof reserveEmailBudget>[0]): Promise<void> {
  const budget = await reserveEmailBudget(req);
  if (!budget.allowed) throw new Error("rate_limited");
}

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
    // A-03: count the ATTEMPT (per address and per IP) before asking Supabase.
    await reserveOrThrow({ kind: "code_verify", ip: await requestIp(), subject: address });
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
): Promise<ActionResult<{ next: string; confirmIdentity?: string }>> {
  return run("confirmEmailToken", async () => {
    const hash = String(tokenHash ?? "");
    if (!hash || hash.length > 512 || !CONFIRM_TYPES.includes(type as EmailOtpType)) {
      throw new Error("invalid_input");
    }
    // A-03: no address here, so the target bucket is a hash of the token.
    await reserveOrThrow({
      kind: "code_verify",
      ip: await requestIp(),
      subject: `token:${createHash("sha256").update(hash).digest("hex")}`,
    });
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: hash });
    if (error) throw new Error(authCodeFor(error));
    const dest = safeNext(next, { fallback: defaultNextFor(localeOf(locale)) });
    // S9-02 A-08 (login CSRF): the session exists now. Proceed silently only when
    // THIS browser asked for a sign-in link for THIS address; otherwise the client
    // shows "Vas a entrar como j***@dominio.com" and the person decides.
    const email = data.user?.email ?? (await supabase.auth.getUser()).data.user?.email ?? null;
    if ((await checkSignInIntent(email)) === "match") {
      await clearSignInIntent();
      return { next: dest };
    }
    return { next: dest, confirmIdentity: email ? maskEmail(email) : "***" };
  });
}

// verifyOtp failures -> the action error codes that already have copy.
function authCodeFor(error: { code?: string; message?: string }): "invalid_token" | "rate_limited" | "unknown" {
  const key: AuthErrorKey = mapAuthError(error.code ?? error.message);
  if (key === "rate_limited") return "rate_limited";
  if (key === "code_invalid" || key === "link_failed") return "invalid_token";
  return "unknown";
}

export type SignOutScope = "local" | "global";

/**
 * Ends THIS device's session by default (S8-07, F-cuenta-2): the old call used
 * Supabase's default (global) scope and signed the person out everywhere.
 * `scope: "global"` is the explicit "sign out on all devices" option.
 *
 * Returns the landing path instead of redirecting (F-cuenta-7): the client
 * wipes this device's caches only AFTER the server confirmed, so an offline
 * tap leaves the session and the cached pages intact.
 */
export async function signOut(
  locale?: string,
  scope: SignOutScope = "local",
): Promise<ActionResult<{ next: string }>> {
  return run("signOut", async () => {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: scope === "global" ? "global" : "local" });
    if (error) throw new Error("unknown");
    return { next: localeOf(locale) === "en" ? "/en" : "/" };
  });
}

/**
 * Signs out THIS device and lands on the login screen so the person can
 * authenticate as someone else (combined with prompt=select_account this
 * forces Google's account chooser on mobile). `next` (a validated in-app path)
 * rides along, which the guest-claim card uses for "Usar otra cuenta".
 */
export async function switchAccount(
  locale: string,
  next?: string,
): Promise<ActionResult<{ next: string }>> {
  return run("switchAccount", async () => {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("unknown");
    const href = loginHref(localeOf(locale), next);
    // The claim chain marks its login with intent=claim (login copy).
    const claiming = href.includes("?next=") && decodeURIComponent(href).includes("/auth/claim");
    return { next: claiming ? `${href}&intent=claim` : href };
  });
}

/**
 * Starts an email change (S8-07, F-cuenta-5). Registered users only: a guest
 * has no address to change. Supabase mails a confirmation link (to both
 * addresses when "Secure email change" is on); it returns through
 * /auth/confirm (type=email_change) to the profile. The address stays the old
 * one until confirmed, and the profile page shows the pending one.
 */
export async function requestEmailChange(
  email: string,
  locale?: string,
): Promise<ActionResult<{ pending: string }>> {
  return run("requestEmailChange", async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");
    if (!isRegisteredUser(user)) throw new Error("not_found_or_forbidden");

    const address = v.email(email);
    if (address === (user.email ?? "").toLowerCase()) throw new Error("invalid_input");

    // A-04: Supabase mails the NEW address from our sender; spend one
    // magic_link-style send (per target address and per IP) before it does.
    await reserveOrThrow({ kind: "magic_link", ip: await requestIp(), email: address });

    const loc = localeOf(locale);
    const origin = await trustedRequestOrigin();
    // S9-02 A-08: the confirm link returns here signed in as either address.
    await rememberSignInIntent([address, user.email ?? ""].filter(Boolean));
    const { error } = await supabase.auth.updateUser(
      { email: address },
      { emailRedirectTo: `${origin}/${loc}/app/profile` },
    );
    if (error) {
      if (error.code === "email_exists") throw new Error("email_exists");
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        throw new Error("rate_limited");
      }
      throw new Error("unknown");
    }
    return { pending: address };
  });
}

