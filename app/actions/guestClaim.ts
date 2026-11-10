"use server";

import { createClient } from "@/lib/supabase/server";
import { mergeGuestData } from "@/lib/guestClaim";
import { mintGuestClaimToken, safeClaimBack, verifyGuestClaimToken } from "@/lib/guestClaimToken";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";

function asLocale(locale: string): "es" | "en" {
  return locale === "en" ? "en" : "es";
}

function claimPath(loc: string, token: string, back: string, error?: string): string {
  const base = `/${loc}/auth/claim?token=${encodeURIComponent(token)}&back=${encodeURIComponent(back)}`;
  return error ? `${base}&error=${error}` : base;
}

/**
 * Step 1 of the guest → account flow (see lib/guestClaim.ts): called from the
 * results-page banner while the viewer is still the anonymous guest. Mints a
 * claim token for that anonymous id and returns the URL of the NORMAL login
 * page (magic link + Google) with `next` pointing at /auth/claim, which
 * asks for confirmation and then redeems the token once the sign-in completes.
 */
export async function startGuestClaim(
  locale: string,
  backPath: string,
): Promise<{ ok: true; loginUrl: string } | { ok: false; error: "not_anonymous" | "unauthenticated" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (!user.is_anonymous) return { ok: false, error: "not_anonymous" };

  const loc = asLocale(locale);
  const back = safeClaimBack(loc, backPath);
  const token = mintGuestClaimToken(user.id);
  return {
    ok: true,
    loginUrl: `/${loc}/auth/login?next=${encodeURIComponent(claimPath(loc, token, back))}&intent=claim`,
  };
}

/**
 * Step 3: the confirmation card's button. A server action (POST, Origin-
 * checked by Next) — the merge is never triggered by a GET, so a cross-site
 * link can't pollute a signed-in account; the user must be signed in with a
 * real account, and the token must still verify.
 *
 * Returns an ActionResult (S8-07, F-guest-8) instead of redirecting on every
 * outcome: the card maps `invalid_token` / `token_expired` / `not_found`
 * (already linked) to its final states and shows a RETRY card for anything
 * else (`unknown` covers a failed auth lookup and a rolled-back merge), which
 * is safe to repeat because the merge is one transaction.
 */
export async function confirmGuestClaim(
  locale: string,
  token: string,
  back: string,
): Promise<ActionResult<{ next: string }>> {
  const loc = asLocale(locale);
  const safeBack = safeClaimBack(loc, back);
  return run("confirmGuestClaim", async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) throw new Error("not_authenticated");

    const verified = verifyGuestClaimToken(String(token ?? ""));
    if (!verified) throw new Error("invalid_token");
    if (verified.expired) throw new Error("token_expired");

    const result = await mergeGuestData(verified.anonymousUserId, user.id, verified.issuedAt);
    if (!result.ok) {
      if (result.error === "lookup_failed") throw new Error("unknown");
      if (result.error === "same_user") throw new Error("invalid_input");
      throw new Error("not_found");
    }
    return { next: safeBack };
  });
}
