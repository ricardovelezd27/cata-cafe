"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function updateProfile(input: {
  displayName: string;
  preferredLang: "es" | "en";
  bio: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  await prisma.profile.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      displayName: input.displayName || user.email?.split("@")[0] || "Catador",
      preferredLang: input.preferredLang,
      bio: input.bio,
    },
    update: {
      displayName: input.displayName,
      preferredLang: input.preferredLang,
      bio: input.bio,
    },
  });

  revalidatePath(`/${input.preferredLang}/app/profile`);
  return { ok: true };
}
