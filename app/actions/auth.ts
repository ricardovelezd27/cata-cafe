"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createEphemeralClient } from "@/lib/supabase/ephemeral";
import { sendMagicLink, defaultNextFor, type MagicLinkResult } from "@/lib/magicLink";
import { trustedRequestOrigin } from "@/lib/requestOrigin";
import { safeNext } from "@/lib/safeNext";
import { mapAuthError, type AuthErrorKey } from "@/lib/authErrors";
import { run } from "@/lib/safeAction";
import { reserveEmailBudget } from "@/lib/emailBudget";
import { parseClientIp } from "@/lib/requestIp";
import { loginHref } from "@/lib/authRedirect";
import { clearPendingSignIn, readPendingSignIn, storePendingSignIn } from "@/lib/signInPendingCookie";
import { logWarn } from "@/lib/log";
import { classifyPendingFailure, pendingEmailMatches } from "@/lib/signInPendingRules";
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
    // S9-02 A-08 (login CSRF): verify on a client that cannot write this
    // browser's cookies. The token is consumed and the tokens come back, but no
    // session exists in the browser until the intent check below says so.
    const ephemeral = createEphemeralClient();
    const { data, error } = await ephemeral.auth.verifyOtp({ type: type as EmailOtpType, token_hash: hash });
    if (error) throw new Error(authCodeFor(error));
    const dest = safeNext(next, { fallback: defaultNextFor(localeOf(locale)) });
    const session = data.session;
    // No session (e.g. the first of two email_change confirmations): nothing to
    // establish, and the browser's current session stays as it was.
    if (!session?.access_token || !session.refresh_token) return { next: dest };
    const email = data.user?.email ?? session.user?.email ?? null;
    const tokens = { access_token: session.access_token, refresh_token: session.refresh_token };

    if (email && (await checkSignInIntent(email)) === "match") {
      // This browser asked for a link for this very address: same-browser
      // sign-in stays zero extra steps.
      const supabase = await createClient();
      const { error: setError } = await supabase.auth.setSession(tokens);
      if (!setError) {
        await clearPendingSignIn();
        await clearSignInIntent();
        return { next: dest };
      }
      // The one-time link is already consumed: do not strand the person. Fall
      // through and park the tokens so "Si, continuar" acts as the retry.
    }

    // Mismatch, no intent cookie, or a failed zero-click setSession: do NOT
    // leave the person without a way forward. Park the tokens for 10 minutes;
    // the person confirms with acceptPendingSignIn (also the retry) or discards
    // them with rejectPendingSignIn. The FULL address is shown (not masked): a
    // mask is defeated by an address sharing the first letter and domain.
    if (!email) throw new Error("invalid_token");
    const stored = await storePendingSignIn({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });
    if (!stored) throw new Error("unknown");
    return { next: dest, confirmIdentity: email };
  });
}

/**
 * "Si, continuar" on the identity card (S9-02, A-08): establishes the session
 * parked by confirmEmailToken. Callable by an unauthenticated browser by
 * design (it IS the sign-in); it only works with the httpOnly pending cookie
 * minted for this browser by confirmEmailToken in the last 10 minutes.
 */
export async function acceptPendingSignIn(
  shownEmail: string,
  locale?: string,
  next?: string,
): Promise<ActionResult<{ next: string }>> {
  return run("acceptPendingSignIn", async () => {
    const pending = await readPendingSignIn();
    if (!pending) throw new Error("token_expired");

    // Tie the parked tokens to the address the card displayed. Transient
    // failures keep the cookie (the same button retries); definitive ones drop it.
    const { data: who, error: whoError } = await createEphemeralClient().auth.getUser(
      pending.accessToken,
    );
    if (whoError || !who?.user) {
      if (whoError && classifyPendingFailure(whoError) === "retry") throw new Error("unknown");
      await clearPendingSignIn();
      throw new Error("token_expired");
    }
    if (!pendingEmailMatches(shownEmail, who.user.email)) {
      await clearPendingSignIn();
      throw new Error("conflict");
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.setSession({
      access_token: pending.accessToken,
      refresh_token: pending.refreshToken,
    });
    if (error) {
      if (classifyPendingFailure(error) === "retry") throw new Error("unknown");
      await clearPendingSignIn();
      throw new Error("token_expired");
    }
    await clearPendingSignIn();
    await clearSignInIntent();
    return { next: safeNext(next, { fallback: defaultNextFor(localeOf(locale)) }) };
  });
}

/**
 * "No soy yo" on the identity card (S9-02, A-08): discards the parked session.
 * Best-effort revokes THAT session only (ephemeral client, local scope) and
 * always deletes the pending cookie. It never touches the browser's own
 * session: someone already signed in as themselves stays signed in.
 */
export async function rejectPendingSignIn(): Promise<ActionResult> {
  return run("rejectPendingSignIn", async () => {
    const pending = await readPendingSignIn();
    try {
      if (pending) {
        // One call: POST /logout?scope=local with the parked access token as
        // the bearer (auth.admin.signOut(jwt, scope) needs no service role).
        const { error: outError } = await createEphemeralClient().auth.admin.signOut(
          pending.accessToken,
          "local",
        );
        if (outError) throw outError;
      }
    } catch (err) {
      logWarn({
        where: "action.rejectPendingSignIn",
        code: "revoke_failed",
        message: (err as { code?: string } | null)?.code ?? "unknown",
      });
    } finally {
      await clearPendingSignIn();
    }
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

