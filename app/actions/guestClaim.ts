"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  mergeGuestData,
  mintGuestClaimToken,
  safeClaimBack,
  verifyGuestClaimToken,
} from "@/lib/guestClaim";

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
 * Step 3: the confirmation card's submit. A server action (POST, Origin-
 * checked by Next) — the merge is never triggered by a GET, so a cross-site
 * link can't pollute a signed-in account; the user must be signed in with a
 * real account, and the token must still verify. Redirects on every outcome.
 */
export async function confirmGuestClaim(locale: string, token: string, back: string): Promise<void> {
  const loc = asLocale(locale);
  const safeBack = safeClaimBack(loc, back);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    redirect(`/${loc}/auth/login?next=${encodeURIComponent(claimPath(loc, token, safeBack))}&intent=claim`);
  }

  const verified = verifyGuestClaimToken(token);
  if (!verified) redirect(claimPath(loc, token, safeBack, "invalid"));
  if (verified.expired) redirect(claimPath(loc, token, safeBack, "expired"));

  const result = await mergeGuestData(verified.anonymousUserId, user.id, verified.issuedAt);
  if (!result.ok) redirect(claimPath(loc, token, safeBack, "already"));

  redirect(safeBack);
}
