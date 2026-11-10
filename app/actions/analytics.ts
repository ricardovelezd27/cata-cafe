"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { listAllAuthUsers, listAllAuthUsersStrict } from "@/lib/supabase/adminUsers";
import { run } from "@/lib/safeAction";
import type { ActionResult } from "@/lib/actionResult";
import { loadSavedInsights, type SavedInsightRow } from "@/lib/analytics/savedInsights";
import { buildRegisteredUsersCsv } from "@/lib/analytics/usersCsv";
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
import { directoryEmail, scopeFor } from "@/lib/analytics/scope";
import { auditLog } from "@/lib/analytics/audit";
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
import { DELETED_PROFILE_PREFIX } from "@/lib/accountDeletion/deletedProfile";
import type { Prisma } from "@/app/generated/prisma/client";

function asLocale(locale: string): "es" | "en" {
  return locale === "en" ? "en" : "es";
}

// Interactive insight actions return ActionResult via run() (S8-14,
// F-insights-7): a revoked analytics user pressing "Guardar" used to hit an
// opaque thrown `forbidden` (error boundary); now it maps to
// `not_found_or_forbidden` and the client shows the localized toast. Invalid
// input throws `invalid_input` inside the body (mapped by run()).

export async function runInsight(
  rawConfig: unknown,
  locale: string,
): Promise<ActionResult<InsightRow[]>> {
  return run("runInsight", async () => {
    const scope = scopeFor(await requireAnalyticsAccess());
    let config: InsightConfig;
    try {
      config = parseInsightConfig(rawConfig);
    } catch {
      throw new Error("invalid_input");
    }
    return runInsightQuery(config, asLocale(locale), scope);
  });
}

export async function runPivot(
  rawConfig: unknown,
  locale: string,
): Promise<ActionResult<PivotResult>> {
  return run("runPivot", async () => {
    const scope = scopeFor(await requireAnalyticsAccess());
    let config: PivotConfig;
    try {
      config = parsePivotConfig(rawConfig);
    } catch {
      throw new Error("invalid_input");
    }
    return runPivotQuery(config, asLocale(locale), scope);
  });
}

export async function listPivotDimensionValues(
  dataset: string,
  dimension: string,
  locale: string,
): Promise<ActionResult<PivotAxisKey[]>> {
  return run("listPivotDimensionValues", async () => {
    const scope = scopeFor(await requireAnalyticsAccess());
    if (!DATASETS.includes(dataset as Dataset)) throw new Error("invalid_input");
    const ds = dataset as Dataset;
    if (!DATASET_DIMENSIONS[ds].includes(dimension as DimensionId)) {
      throw new Error("invalid_input");
    }
    return listDimensionValues(ds, dimension as DimensionId, asLocale(locale), scope);
  });
}

export async function saveInsight(
  name: string,
  rawConfig: unknown,
): Promise<ActionResult<{ id: string }>> {
  return run("saveInsight", async () => {
    const access = await requireAnalyticsAccess();
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (trimmed.length < 1 || trimmed.length > 80) throw new Error("invalid_input");
    const pivotLike = isPivotConfigLike(rawConfig);
    let config: InsightConfig | PivotConfig;
    try {
      config = pivotLike ? parsePivotConfig(rawConfig) : parseInsightConfig(rawConfig);
    } catch {
      throw new Error("invalid_input");
    }
    const created = await prisma.savedInsight.create({
      data: {
        name: trimmed,
        config: config as unknown as Prisma.InputJsonValue,
        createdBy: access.userId,
      },
    });
    return { id: created.id };
  });
}

export async function listSavedInsights(): Promise<ActionResult<SavedInsightRow[]>> {
  return run("listSavedInsights", () => loadSavedInsights());
}

export async function deleteSavedInsight(id: string): Promise<ActionResult<void>> {
  return run("deleteSavedInsight", async () => {
    const access = await requireAnalyticsAccess();
    const insight = await prisma.savedInsight.findUnique({
      where: { id },
      select: { createdBy: true },
    });
    if (!insight) throw new Error("not_found");
    if (insight.createdBy !== access.userId && !access.isSuperAdmin) {
      throw new Error("not_found_or_forbidden");
    }
    await prisma.savedInsight.delete({ where: { id } });
  });
}

export async function runBenchmark(
  rawFilter: unknown,
): Promise<ActionResult<BenchmarkComparison>> {
  return run("runBenchmark", async () => {
    const scope = scopeFor(await requireAnalyticsAccess());
    let filter: BenchmarkFilter;
    try {
      filter = parseBenchmarkFilter(rawFilter);
    } catch {
      throw new Error("invalid_input");
    }
    return getBenchmarkComparison(filter, scope);
  });
}

export async function runOriginContext(
  countryCode: unknown,
  locale: string,
): Promise<ActionResult<OriginContext>> {
  return run("runOriginContext", async () => {
    const scope = scopeFor(await requireAnalyticsAccess());
    if (
      typeof countryCode !== "string" ||
      !COFFEE_COUNTRIES.some((c) => c.iso2 === countryCode)
    ) {
      throw new Error("invalid_input");
    }
    return getOriginContext(countryCode, asLocale(locale), scope);
  });
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
  const access = await requireUsersDirectoryAccess();
  // NOTE: the co-cupper rule (lib/coCuppers.ts) intentionally does NOT apply to
  // this admin directory; the audit line below is the accountability for it.

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
    // Deleted-account placeholders (S8-19) are not users: hidden here and in
    // the counts built from this list.
    where: { NOT: { id: { startsWith: DELETED_PROFILE_PREFIX } } },
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

  auditLog("listAnalyticsUsers", access.userId, { count: profiles.length });

  return profiles.map((p) => {
    const email = emailById.get(p.id) ?? null;
    return {
      userId: p.id,
      displayName: p.displayName,
      email: directoryEmail(email, access.isSuperAdmin),
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

/**
 * CSV (`email,created_at`) of registered, non-anonymous accounts — the in-app
 * twin of scripts/export-emails.ts. PII: returned to the caller only, never
 * written to disk or logged.
 */
export async function exportRegisteredUsersCsv() {
  return run("exportRegisteredUsersCsv", async () => {
    // S8-08 F-insights-2: the full email list is super-admin only (AI admins
    // could export it before). Ricardo confirms; widen here if not.
    const access = await requireSuperAdmin();
    const { csv, count } = buildRegisteredUsersCsv(await listAllAuthUsersStrict());
    // An empty export is never legitimate (the caller is a registered user) —
    // treat it as a failed listing rather than handing back a header-only file.
    if (count === 0) throw new Error("auth_list_empty");
    auditLog("exportRegisteredUsersCsv", access.userId, { count });
    return { csv, count, filename: `cafesensible-users-${new Date().toISOString().slice(0, 10)}.csv` };
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
  auditLog(enabled ? "grantAnalyticsAccess" : "revokeAnalyticsAccess", access.userId, {
    targetId: userId,
  });

  // Layout-wide so the target user's Sidebar/BottomNav pick up the flag.
  revalidatePath("/", "layout");
  return { ok: true };
}
