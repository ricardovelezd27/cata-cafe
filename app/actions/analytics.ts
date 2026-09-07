"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { listAllAuthUsers } from "@/lib/supabase/adminUsers";
import {
  isSuperAdminEmail,
  requireAnalyticsAccess,
  requireSuperAdmin,
  requireUsersDirectoryAccess,
} from "@/lib/analytics/access";
import {
  DATASET_DIMENSIONS,
  DATASETS,
  isPivotConfigLike,
  parseInsightConfig,
  parsePivotConfig,
} from "@/lib/analytics/types";
import type {
  Dataset,
  DimensionId,
  InsightConfig,
  InsightRow,
  PivotAxisKey,
  PivotConfig,
  PivotResult,
} from "@/lib/analytics/types";
import { listDimensionValues, runInsightQuery, runPivotQuery } from "@/lib/analytics/queries";
import {
  getBenchmarkComparison,
  getOriginContext,
  parseBenchmarkFilter,
  type BenchmarkComparison,
  type BenchmarkFilter,
  type OriginContext,
} from "@/lib/analytics/benchmarks";
import { COFFEE_COUNTRIES } from "@/lib/analytics/normalize";
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

export async function runPivot(
  rawConfig: unknown,
  locale: string,
): Promise<{ ok: true; result: PivotResult } | { ok: false; error: string }> {
  await requireAnalyticsAccess();
  let config: PivotConfig;
  try {
    config = parsePivotConfig(rawConfig);
  } catch {
    return { ok: false, error: "invalid_pivot" };
  }
  const result = await runPivotQuery(config, asLocale(locale));
  return { ok: true, result };
}

export async function listPivotDimensionValues(
  dataset: string,
  dimension: string,
  locale: string,
): Promise<{ ok: true; values: PivotAxisKey[] } | { ok: false; error: string }> {
  await requireAnalyticsAccess();
  if (!DATASETS.includes(dataset as Dataset)) {
    return { ok: false, error: "invalid_dimension" };
  }
  const ds = dataset as Dataset;
  if (!DATASET_DIMENSIONS[ds].includes(dimension as DimensionId)) {
    return { ok: false, error: "invalid_dimension" };
  }
  const values = await listDimensionValues(ds, dimension as DimensionId, asLocale(locale));
  return { ok: true, values };
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
  const pivotLike = isPivotConfigLike(rawConfig);
  let config: InsightConfig | PivotConfig;
  try {
    config = pivotLike ? parsePivotConfig(rawConfig) : parseInsightConfig(rawConfig);
  } catch {
    return { ok: false, error: pivotLike ? "invalid_pivot" : "invalid_config" };
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

export async function runBenchmark(
  rawFilter: unknown,
): Promise<{ ok: true; comparison: BenchmarkComparison } | { ok: false; error: string }> {
  await requireAnalyticsAccess();
  let filter: BenchmarkFilter;
  try {
    filter = parseBenchmarkFilter(rawFilter);
  } catch {
    return { ok: false, error: "invalid_filter" };
  }
  const comparison = await getBenchmarkComparison(filter);
  return { ok: true, comparison };
}

export async function runOriginContext(
  countryCode: unknown,
  locale: string,
): Promise<{ ok: true; context: OriginContext } | { ok: false; error: string }> {
  await requireAnalyticsAccess();
  if (
    typeof countryCode !== "string" ||
    !COFFEE_COUNTRIES.some((c) => c.iso2 === countryCode)
  ) {
    return { ok: false, error: "invalid_country" };
  }
  const context = await getOriginContext(countryCode, asLocale(locale));
  return { ok: true, context };
}

export interface AnalyticsUser {
  userId: string;
  displayName: string;
  email: string | null;
  country: string | null;
  analyticsAccess: boolean;
  isSuperAdmin: boolean;
  isAnonymous: boolean;
  role: string;
  createdAt: string;
  sessionsCount: number;
  coffeesCount: number;
}

/**
 * Shared with AI admins (the partner) — see requireUsersDirectoryAccess.
 * Acceso (grant management) stays behind requireSuperAdmin below.
 */
export async function listAnalyticsUsers(): Promise<AnalyticsUser[]> {
  await requireUsersDirectoryAccess();

  // Profile has no email column — emails live in Supabase auth. Map ids→emails
  // (and flag anonymous/guest users) via the service-role admin API; degrade
  // to null emails if the call fails.
  const authUsers = await listAllAuthUsers();
  const emailById = new Map<string, string>();
  const anonIds = new Set<string>();
  for (const u of authUsers) {
    if (u.email) emailById.set(u.id, u.email);
    if (u.isAnonymous) anonIds.add(u.id);
  }

  const profiles = await prisma.profile.findMany({
    select: {
      id: true,
      displayName: true,
      country: true,
      analyticsAccess: true,
      role: true,
      createdAt: true,
      _count: { select: { cuppingSessions: true, coffees: true } },
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
      isAnonymous: anonIds.has(p.id),
      role: p.role,
      createdAt: p.createdAt.toISOString(),
      sessionsCount: p._count.cuppingSessions,
      coffeesCount: p._count.coffees,
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
