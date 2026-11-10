import "server-only";

import { prisma } from "@/lib/prisma";
import { requireAnalyticsAccess } from "@/lib/analytics/access";

export type SavedInsightRow = {
  id: string;
  name: string;
  config: unknown;
  createdAt: string;
  isMine: boolean;
};

/**
 * Read helper for the saved-insights list (S8-14, F-insights-7): used by the
 * explorer page directly and by the `listSavedInsights` action after a save.
 * Lives in lib/ because a "use server" export is a public POST endpoint and a
 * server page should not call an action for a plain read. Gated here too, so
 * it is never reachable without analytics access.
 */
export async function loadSavedInsights(): Promise<SavedInsightRow[]> {
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
