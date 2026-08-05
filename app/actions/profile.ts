"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/constants";

export async function completeOnboarding(data: {
  displayName: string;
  role: string;
  country: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  await prisma.profile.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      displayName: data.displayName || user.email?.split("@")[0] || "Catador",
      role: data.role,
      country: data.country,
      onboardingCompleted: true,
    },
    update: {
      displayName: data.displayName,
      role: data.role,
      country: data.country,
      onboardingCompleted: true,
    },
  });

  try {
    await supabase.auth.updateUser({ data: { display_name: data.displayName } });
  } catch {
    // Non-critical — profile is already updated
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateProfile(input: {
  displayName: string;
  preferredLang: "es" | "en";
  bio: string;
  /** Whitelist-validated against ROLE_LABELS below — invalid/absent values are dropped, never persisted. */
  role?: string;
  /** Free text, trimmed to 56 chars. Empty/absent clears the field to null. */
  country?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  // Whitelist role against the single source of truth for valid role keys —
  // an unrecognized value is silently dropped rather than persisted.
  const role =
    input.role !== undefined && Object.prototype.hasOwnProperty.call(ROLE_LABELS, input.role)
      ? input.role
      : undefined;
  const country =
    input.country === undefined
      ? undefined
      : input.country === null
        ? null
        : input.country.trim().slice(0, 56) || null;

  await prisma.profile.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      displayName: input.displayName || user.email?.split("@")[0] || "Catador",
      preferredLang: input.preferredLang,
      bio: input.bio,
      ...(role !== undefined ? { role } : {}),
      ...(country !== undefined ? { country } : {}),
    },
    update: {
      displayName: input.displayName,
      preferredLang: input.preferredLang,
      bio: input.bio,
      ...(role !== undefined ? { role } : {}),
      ...(country !== undefined ? { country } : {}),
    },
  });

  revalidatePath(`/${input.preferredLang}/app/profile`);
  return { ok: true };
}
