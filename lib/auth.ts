import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function requireUser(opts?: { skipProfileUpsert?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  if (!opts?.skipProfileUpsert) {
    await prisma.profile.upsert({
      where: { id: user.id },
      create: { id: user.id, displayName: user.email?.split("@")[0] ?? "Catador" },
      update: {},
    });
  }
  return user;
}
