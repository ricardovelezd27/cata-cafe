"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/constants";
import * as v from "@/lib/validate";
import { run } from "@/lib/safeAction";
import { logWarn, errorMessage } from "@/lib/log";

// Whitelist against the single source of truth for valid role keys — an
// unrecognized value is dropped, never persisted (shared by both actions).
function safeRole(role: unknown): string | undefined {
  return typeof role === "string" && Object.prototype.hasOwnProperty.call(ROLE_LABELS, role)
    ? role
    : undefined;
}

// First screen a new user sees (WelcomeModal) — returns a result instead of
// throwing so the modal can show a message rather than crash the app shell.
export async function completeOnboarding(data: {
  displayName: string;
  role: string;
  country: string;
}) {
  return run("completeOnboarding", async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");

    const displayName =
      v.str(data.displayName, "displayName", { max: 80, required: false }) ??
      user.email?.split("@")[0] ??
      "Catador";
    // Schema default for Profile.role; an unknown choice never reaches the row.
    const role = safeRole(data.role) ?? "cupping_pro";
    const country = v.str(data.country, "country", { max: 56, required: false });

    await prisma.profile.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        displayName,
        role,
        country,
        onboardingCompleted: true,
      },
      update: {
        displayName,
        role,
        country,
        onboardingCompleted: true,
      },
    });

    try {
      await supabase.auth.updateUser({ data: { display_name: displayName } });
    } catch (err) {
      // Non-critical — the Profile row is the source of truth for the name;
      // auth metadata only feeds the magic-link email greeting.
      logWarn({
        where: "completeOnboarding.updateUser",
        userId: user.id,
        message: errorMessage(err),
      });
    }

    revalidatePath("/", "layout");
    return { ok: true as const };
  });
}

/**
 * Closing the welcome dialog (X, Esc, "skip") marks onboarding done and writes
 * NOTHING else (S8-06, F-entrar-4): the old skip stamped role "enthusiast" on
 * people who never chose it. Role and country can still be set on the profile.
 */
export async function dismissOnboarding() {
  return run("dismissOnboarding", async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");
    await prisma.profile.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        displayName: user.email?.split("@")[0] ?? "Catador",
        onboardingCompleted: true,
      },
      update: { onboardingCompleted: true },
    });
    revalidatePath("/", "layout");
    return { ok: true as const };
  });
}

/**
 * The profile form's save (S8-07, F-cuenta-8). Returns an ActionResult through
 * run() — a thrown error used to reach the browser as an opaque digest and the
 * form could only say "error". Syncs the auth `display_name` like
 * completeOnboarding does (the magic-link email greeting reads it).
 */
export async function updateProfile(input: {
  displayName: string;
  preferredLang: "es" | "en";
  bio: string;
  /** Whitelist-validated against ROLE_LABELS — invalid/absent values are dropped, never persisted. */
  role?: string;
  /** Free text, trimmed to 56 chars. Empty/absent clears the field to null. */
  country?: string | null;
}) {
  return run("updateProfile", async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("not_authenticated");

    const displayName =
      v.str(input.displayName, "displayName", { max: 80, required: false }) ??
      user.email?.split("@")[0] ??
      "Catador";
    const preferredLang = v.oneOf(input.preferredLang, "preferredLang", ["es", "en"] as const);
    const bio = v.str(input.bio, "bio", { max: 1000, required: false }) ?? "";
    const role = safeRole(input.role);
    const country =
      input.country === undefined
        ? undefined
        : v.str(input.country, "country", { max: 56, required: false });

    await prisma.profile.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        displayName,
        preferredLang,
        bio,
        ...(role !== undefined ? { role } : {}),
        ...(country !== undefined ? { country } : {}),
      },
      update: {
        displayName,
        preferredLang,
        bio,
        ...(role !== undefined ? { role } : {}),
        ...(country !== undefined ? { country } : {}),
      },
    });

    try {
      await supabase.auth.updateUser({ data: { display_name: displayName } });
    } catch (err) {
      // Non-critical: the Profile row is the source of truth for the name.
      logWarn({
        where: "updateProfile.updateUser",
        userId: user.id,
        message: errorMessage(err),
      });
    }

    revalidatePath(`/${preferredLang}/app/profile`);
    return { ok: true as const };
  });
}

