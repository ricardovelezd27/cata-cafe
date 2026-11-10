"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendMagicLink } from "@/lib/magicLink";

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

  if (error || !data.url) return { ok: false as const, error: error?.message ?? "no_url" };
  redirect(data.url);
}

export async function signInWithMagicLink(formData: FormData, next?: string) {
  return sendMagicLink(String(formData.get("email") || ""), next);
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
