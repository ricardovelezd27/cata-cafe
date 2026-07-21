import "server-only";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// The super-admin always has analytics access and is the only one who can
// grant/revoke the Profile.analyticsAccess flag for other users.
const SUPER_ADMIN_EMAIL = (
  process.env.ANALYTICS_SUPER_ADMIN_EMAIL ?? "ricardo.velez88@gmail.com"
).toLowerCase();

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === SUPER_ADMIN_EMAIL;
}

/** The super-admin address itself — digest recipient resolution (cron, no cookies). */
export function getSuperAdminEmail(): string {
  return SUPER_ADMIN_EMAIL;
}

export type AnalyticsAccess = {
  userId: string;
  email: string | null;
  isSuperAdmin: boolean;
};

/** Returns null when the current user has no analytics access (or no session). */
export async function getAnalyticsAccess(): Promise<AnalyticsAccess | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (isSuperAdminEmail(user.email)) {
    return { userId: user.id, email: user.email ?? null, isSuperAdmin: true };
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { analyticsAccess: true },
  });
  if (!profile?.analyticsAccess) return null;

  return { userId: user.id, email: user.email ?? null, isSuperAdmin: false };
}

/**
 * Guard for analytics server actions. Server actions are independent HTTP
 * endpoints, so each one must call this even though the insights layout
 * already gates the pages.
 */
export async function requireAnalyticsAccess(): Promise<AnalyticsAccess> {
  const access = await getAnalyticsAccess();
  if (!access) throw new Error("forbidden");
  return access;
}

/** Guard for user-management actions — super-admin only. */
export async function requireSuperAdmin(): Promise<AnalyticsAccess> {
  const access = await getAnalyticsAccess();
  if (!access?.isSuperAdmin) throw new Error("forbidden");
  return access;
}
