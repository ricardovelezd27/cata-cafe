import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { classifyAuthResult } from "@/lib/authState";
import { loginHref } from "@/lib/authRedirect";
import { prisma } from "@/lib/prisma";
import { isRegisteredUser } from "@/lib/guestScope";
import { IDENTITY_CHANGED, identityMismatch } from "@/lib/expectedUser";

/** Signed in / signed out / auth service unreachable (lib/authState.ts). */
export async function getAuthUser() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    const state = classifyAuthResult({ user: data?.user ?? null, error });
    if (state === "user" && data?.user) return { state, user: data.user } as const;
    return { state: state === "user" ? "none" : state } as const;
  } catch {
    return { state: "unreachable" } as const;
  }
}

/** The page-level auth backstop (the proxy redirects signed-out requests
 *  first). Signed out -> login that returns to `nextPath` (F-entrar-3). The
 *  auth service being down THROWS so the route's error boundary shows the
 *  retry panel instead of a login page (F-entrar-2). Anonymous guests count
 *  as users here; proxy.ts and the pages still gate what they may open. */
export async function requireAppUser(locale: string, nextPath: string) {
  const auth = await getAuthUser();
  if (auth.state === "user") return auth.user;
  if (auth.state === "none") redirect(loginHref(locale, nextPath));
  throw new Error("auth_unreachable");
}

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

/** requireUser() plus the optional "is this still the person the screen was
 *  rendered for?" check (S10 WP8 third review H1/L2). With `expectedUserId`
 *  absent this IS requireUser(), byte for byte (no user -> not_authenticated).
 *  With it present, the cookie's user is read WITHOUT throwing: no user at all
 *  or a different user throws `identity_changed` BEFORE any write or profile
 *  upsert, so the caller can map it (live writes: ActionResult; offline
 *  replays: "pending", no attempt burnt). */
export async function requireUserExpecting(
  expectedUserId: string | undefined,
  opts?: { skipProfileUpsert?: boolean },
) {
  if (expectedUserId === undefined) return requireUser(opts);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || identityMismatch(expectedUserId, user.id)) {
    throw new Error(IDENTITY_CHANGED);
  }
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
