import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isRegisteredUser } from "@/lib/guestScope";

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

/** requireUser() for everything a guest must NOT do: create a session, coffee
 *  or group, share, invite, send email (S8-03, F-guest-1). An anonymous user
 *  gets the same answer as a stranger, and is refused BEFORE the profile
 *  upsert so a direct POST leaves no row behind. Guests keep requireUser():
 *  join, evaluate, submit, waiting room, offline replay, claim. Every export
 *  that must use this is listed in tests/registeredOnlyActions.test.ts. */
export async function requireRegisteredUser(opts?: { skipProfileUpsert?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  if (!isRegisteredUser(user)) throw new Error("not_found_or_forbidden");
  if (!opts?.skipProfileUpsert) {
    await prisma.profile.upsert({
      where: { id: user.id },
      create: { id: user.id, displayName: user.email?.split("@")[0] ?? "Catador" },
      update: {},
    });
  }
  return user;
}
