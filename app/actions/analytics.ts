"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isSuperAdminEmail,
  requireAnalyticsAccess,
  requireSuperAdmin,
} from "@/lib/analytics/access";
import { parseInsightConfig } from "@/lib/analytics/types";
import type { InsightConfig, InsightRow } from "@/lib/analytics/types";
import { runInsightQuery } from "@/lib/analytics/queries";
import type { Prisma } from "@/app/generated/prisma/client";

function asLocale(locale: string): "es" | "en" {
  return locale === "en" ? "en" : "es";
}

export async function runInsight(
  rawConfig: unknown,
  locale: string,
): Promise<{ ok: true; rows: InsightRow[] } | { ok: false; error: string }> {
  await requireAnalyticsAccess();
  let config: InsightConfig;
  try {
    config = parseInsightConfig(rawConfig);
  } catch {
    return { ok: false, error: "invalid_config" };
  }
  const rows = await runInsightQuery(config, asLocale(locale));
  return { ok: true, rows };
}

export async function saveInsight(
  name: string,
  rawConfig: unknown,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const access = await requireAnalyticsAccess();
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return { ok: false, error: "invalid_name" };
  }
  let config: InsightConfig;
  try {
    config = parseInsightConfig(rawConfig);
  } catch {
    return { ok: false, error: "invalid_config" };
  }
  const created = await prisma.savedInsight.create({
    data: {
      name: trimmed,
      config: config as unknown as Prisma.InputJsonValue,
      createdBy: access.userId,
    },
  });
  return { ok: true, id: created.id };
}

export async function listSavedInsights(): Promise<
  Array<{ id: string; name: string; config: unknown; createdAt: string; isMine: boolean }>
> {
  const access = await requireAnalyticsAccess();
  const insights = await prisma.savedInsight.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, config: true, createdAt: true, createdBy: true },
  });
  return insights.map((i) => ({
    id: i.id,
    name: i.name,
    config: i.config,
    createdAt: i.createdAt.toISOString(),
    isMine: i.createdBy === access.userId,
  }));
}

export async function deleteSavedInsight(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const access = await requireAnalyticsAccess();
  const insight = await prisma.savedInsight.findUnique({
    where: { id },
    select: { createdBy: true },
  });
  if (!insight) return { ok: false, error: "not_found" };
  if (insight.createdBy !== access.userId && !access.isSuperAdmin) {
    return { ok: false, error: "forbidden" };
  }
  await prisma.savedInsight.delete({ where: { id } });
  return { ok: true };
}

export interface AnalyticsUser {
  userId: string;
  displayName: string;
  email: string | null;
  country: string | null;
  analyticsAccess: boolean;
  isSuperAdmin: boolean;
}

export async function listAnalyticsUsers(): Promise<AnalyticsUser[]> {
  await requireSuperAdmin();

  // Profile has no email column — emails live in Supabase auth. Map ids→emails
  // via the service-role admin API; degrade to null emails if the call fails.
  const emailById = new Map<string, string>();
  try {
    const admin = createAdminClient();
    let page = 1;
    const perPage = 1000;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) break;
      for (const u of data.users) {
        if (u.email) emailById.set(u.id, u.email);
      }
      if (data.users.length < perPage) break;
      page += 1;
    }
  } catch {
    // Emails stay null; the UI shows displayName-only rows.
  }

  const profiles = await prisma.profile.findMany({
    select: {
      id: true,
      displayName: true,
      country: true,
      analyticsAccess: true,
    },
    orderBy: { displayName: "asc" },
  });

  return profiles.map((p) => {
    const email = emailById.get(p.id) ?? null;
    return {
      userId: p.id,
      displayName: p.displayName,
      email,
      country: p.country,
      analyticsAccess: p.analyticsAccess,
      isSuperAdmin: isSuperAdminEmail(email),
    };
  });
}

export async function setAnalyticsAccess(
  userId: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const access = await requireSuperAdmin();
  // The super-admin's own access is email-based and not toggleable.
  if (userId === access.userId) return { ok: false, error: "cannot_change_self" };

  await prisma.profile.update({
    where: { id: userId },
    data: { analyticsAccess: enabled },
  });

  // Layout-wide so the target user's Sidebar/BottomNav pick up the flag.
  revalidatePath("/", "layout");
  return { ok: true };
}
