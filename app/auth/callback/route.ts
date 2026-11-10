import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import { mapAuthError } from "@/lib/authErrors";

const DEFAULT_NEXT = "/es/app";

/** Locale of the destination ("/en/..." -> en; unprefixed = the default, es). */
function localeFor(next: string): "es" | "en" {
  return /^\/en(?=\/|$)/.test(next) ? "en" : "es";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"), { origin, fallback: DEFAULT_NEXT });
  const locale = localeFor(next);

  // A GET must never consume a one-time token: mail scanners and link
  // previewers open every URL in an email (S8-06, F-entrar-1, F-landing-3).
  // Links from templates sent before /auth/confirm existed still point here
  // with a token_hash; hand them to the confirm page, which verifies on a
  // button press (POST).
  if (tokenHash && type) {
    const confirm = new URL(`/${locale}/auth/confirm`, origin);
    confirm.searchParams.set("token_hash", tokenHash);
    confirm.searchParams.set("type", type);
    confirm.searchParams.set("next", next);
    return NextResponse.redirect(confirm);
  }

  // The provider (Google) or Supabase reported a failure on the redirect:
  // forward a mapped code so the login page can say what happened, e.g. a
  // closed consent screen is "cancelled", not "link expired" (F-entrar-9).
  const providerError = searchParams.get("error_code") ?? searchParams.get("error");

  // PKCE code exchange — used by OAuth providers (Google), which complete in
  // the same browser that initiated sign-in, so the code_verifier is present.
  if (code && !providerError) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Preserve `next` on failure so a retry still lands on the intended page —
  // and keep the guest-claim context line on the login page (lib/guestClaim.ts).
  const intent = next.includes("/auth/claim") ? "&intent=claim" : "";
  const errorKey = providerError ? mapAuthError(providerError) : "link_failed";
  return NextResponse.redirect(
    `${origin}/${locale}/auth/login?next=${encodeURIComponent(next)}&error=${errorKey}${intent}`,
  );
}
