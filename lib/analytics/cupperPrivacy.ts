// Cupper pseudonymisation for the platform scope (S8-08, F-insights-1, D4 default c).
// Pure. In platform scope the explorer never shows a display name: each cupper
// becomes a stable "Catador N" (N = rank of the id among the distinct ids in
// the fetched rows, so the same call twice gives the same labels), and a cupper
// with fewer than MIN_GROUP_SIZE_PLATFORM evaluations is suppressed from the
// `cupper` dimension (their single score cannot be pinned on one person).
// User scope is untouched: a caller there only ever sees themselves and the
// cuppers of sessions they own, which the results page already shows by name.
//
// TODO(D4): Kim to confirm (a/b/c); flip here.

import type { AnalyticsScope } from "./types";
import { ANONYMOUS_CUPPER_PREFIX, MIN_GROUP_SIZE_PLATFORM } from "./scope";

export interface CupperRow {
  cupperId?: string;
  cupperName?: string;
  /** True when the `cupper` dimension must not emit a bucket for this row. */
  cupperSuppressed?: boolean;
}

export function anonymizeCuppers<T extends CupperRow>(rows: T[], scope: AnalyticsScope): (T & CupperRow)[] {
  if (scope.kind !== "platform") return rows as (T & CupperRow)[];
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.cupperId) counts.set(r.cupperId, (counts.get(r.cupperId) ?? 0) + 1);
  }
  const ids = [...counts.keys()].sort();
  const index = new Map(ids.map((id, i) => [id, i + 1]));
  return rows.map((r) => {
    if (!r.cupperId) return r;
    return {
      ...r,
      cupperName: `${ANONYMOUS_CUPPER_PREFIX} ${index.get(r.cupperId)}`,
      cupperSuppressed: (counts.get(r.cupperId) ?? 0) < MIN_GROUP_SIZE_PLATFORM,
    };
  });
}
