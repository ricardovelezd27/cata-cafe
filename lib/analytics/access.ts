import "server-only";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Two envs gate two different things:
// - ANALYTICS_SUPER_ADMIN_EMAIL: the one account that can see /app/insights
//   unconditionally and grant/revoke Profile.analyticsAccess for others.
// - ANALYTICS_AI_ADMIN_EMAILS: a comma-separated allowlist for the AI chat/
//   pivot features specifically. Falls back to just the super-admin when
//   unset, so those features stay locked down by default.
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

const AI_ADMIN_EMAILS = (() => {
  const raw = process.env.ANALYTICS_AI_ADMIN_EMAILS ?? "";
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  return emails.length > 0 ? emails : [SUPER_ADMIN_EMAIL];
})();

export function isAiAdminEmail(email: string | null | undefined): boolean {
  return !!email && AI_ADMIN_EMAILS.includes(email.toLowerCase());
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
