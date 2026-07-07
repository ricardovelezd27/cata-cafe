"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getOrigin() {
  const h = await headers();
  return (
    h.get("origin") ||
    `${h.get("x-forwarded-proto") || "http"}://${h.get("host") || "localhost:3000"}`
  );
}

export async function signInWithGoogle(next?: string) {
  const origin = await getOrigin();
  const redirectTo = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });

  if (error || !data.url) return;
  redirect(data.url);
}

export async function signInWithMagicLink(formData: FormData, next?: string) {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { ok: false, error: "missing_email" };

  const origin = await getOrigin();

  // Point at the FINAL destination (not /auth/callback). The Supabase "Magic
  // Link" email template appends this as `next` via {{ .RedirectTo }}, and
  // /auth/callback verifies the token_hash then redirects here. This token_hash
  // flow is stateless, so it works even when the email link opens in a
  // different browser or an in-app webview (where PKCE code exchange fails).
  const redirectTo = next ? `${origin}${next}` : `${origin}/es/app`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
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
