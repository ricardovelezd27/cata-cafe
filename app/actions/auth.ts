"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signInWithMagicLink(formData: FormData, next?: string) {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { ok: false, error: "missing_email" };

  const h = await headers();
  const origin =
    h.get("origin") ||
    `${h.get("x-forwarded-proto") || "http"}://${h.get("host") || "localhost:3000"}`;

  const redirectTo = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

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
