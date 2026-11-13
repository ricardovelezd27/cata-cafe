import "server-only";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { matchesAiAdmin, matchesSuperAdmin, parseSuperAdminEmail } from "@/lib/analytics/adminEmails";

// Two envs gate two different things:
// - ANALYTICS_SUPER_ADMIN_EMAIL: the one account that can see /app/insights
//   unconditionally and grant/revoke Profile.analyticsAccess for others.
// - ANALYTICS_AI_ADMIN_EMAILS: a comma-separated allowlist for the AI chat/
//   pivot features specifically. Falls back to just the super-admin when
//   unset (an empty list when there is no super-admin either), so those
//   features stay locked down by default.
// ANALYTICS_SUPER_ADMIN_EMAIL is required in production (lib/env.ts). Unset or
// blank (local dev) means there is NO super-admin: nobody matches and
// getSuperAdminEmail() is null. No address is built into the code.
// Parsing lives in the pure ./adminEmails (unit-tested).

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return matchesSuperAdmin(email);
}

/** The super-admin address itself, or null when none is configured. Digest recipient resolution (cron, no cookies). */
export function getSuperAdminEmail(): string | null {
  return parseSuperAdminEmail();
}

export function isAiAdminEmail(email: string | null | undefined): boolean {
  return matchesAiAdmin(email);
}

export type AnalyticsAccess = {
  userId: string;
  email: string | null;
  isSuperAdmin: boolean;
  isAiAdmin: boolean;
};

/** Returns null when the current user has no analytics access (or no session). */
export async function getAnalyticsAccess(): Promise<AnalyticsAccess | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const isAiAdmin = isAiAdminEmail(user.email);

  if (isSuperAdminEmail(user.email)) {
    return { userId: user.id, email: user.email ?? null, isSuperAdmin: true, isAiAdmin };
  }

  // AI-admin emails reach analytics access via the env allowlist alone —
  // no Profile.analyticsAccess flag required, so an AI-admin who was never
  // flag-granted (e.g. Kim) still gets in.
  if (isAiAdmin) {
    return { userId: user.id, email: user.email ?? null, isSuperAdmin: false, isAiAdmin: true };
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { analyticsAccess: true },
  });
  if (!profile?.analyticsAccess) return null;

  return { userId: user.id, email: user.email ?? null, isSuperAdmin: false, isAiAdmin: false };
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

/** Guard for AI chat/pivot server actions — the ANALYTICS_AI_ADMIN_EMAILS allowlist. */
export async function requireAiAdmin(): Promise<AnalyticsAccess> {
  const access = await getAnalyticsAccess();
  if (!access?.isAiAdmin) throw new Error("forbidden");
  return access;
}

/** Guard for user-management actions — super-admin only. */
export async function requireSuperAdmin(): Promise<AnalyticsAccess> {
  const access = await getAnalyticsAccess();
  if (!access?.isSuperAdmin) throw new Error("forbidden");
  return access;
}

/**
 * Guard for the Usuarios directory — shared with AI admins (the partner) so
 * they can see who's on the platform, unlike Acceso (grant management),
 * which stays super-admin-only via requireSuperAdmin above.
 */
export async function requireUsersDirectoryAccess(): Promise<AnalyticsAccess> {
  const access = await getAnalyticsAccess();
  if (!access?.isSuperAdmin && !access?.isAiAdmin) throw new Error("forbidden");
  return access;
}
