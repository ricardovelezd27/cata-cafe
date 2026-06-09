import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_NEXT = "/es/app";

/**
 * Resolve the post-auth destination from the `next` param.
 * Accepts both a relative path (OAuth flow) and an absolute same-origin URL
 * (magic-link flow, where {{ .RedirectTo }} is an absolute URL). Guards against
 * open redirects by rejecting any other origin.
 */
function resolveNext(next: string | null, origin: string): string {
  if (!next) return DEFAULT_NEXT;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return DEFAULT_NEXT;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

/** Derive a locale-aware login path from the destination for error fallbacks. */
function loginPathFor(next: string): string {
  const locale = /^\/(es|en)\b/.exec(next)?.[1] ?? "es";
  return `/${locale}/auth/login`;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = resolveNext(searchParams.get("next"), origin);

  const supabase = await createClient();

  // Stateless OTP / magic-link verification. Works in any browser or in-app
  // webview because it does not depend on a PKCE code_verifier cookie being
  // present on the device that opens the email link.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // PKCE code exchange — used by OAuth providers (Google), which complete in
  // the same browser that initiated sign-in, so the code_verifier is present.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Preserve `next` on failure so a retry still lands on the intended page.
  return NextResponse.redirect(
    `${origin}${loginPathFor(next)}?next=${encodeURIComponent(next)}&error=exchange_failed`,
  );
}
