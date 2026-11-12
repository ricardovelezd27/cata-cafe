// Cupper pseudonymisation for the platform scope (S8-08, F-insights-1, D4 default c).
// Pure (the HMAC secret and the whole-scope evaluation counts are injected).
// In platform scope the explorer never shows a display name or a real id: the
// bucket key and the label both derive from a keyed hash of the cupper id
// computed on the server, so a cupper has the SAME "Catador XXXX" under any
// filter and no real id reaches the client. A cupper with fewer than
// MIN_GROUP_SIZE_PLATFORM evaluations IN THE WHOLE SCOPE (not in the filtered
// rows, so differencing two filtered views cannot defeat it) is suppressed from
// the `cupper` dimension.
// User scope is untouched: a caller there only ever sees themselves and the
// cuppers of sessions they own, which the results page already shows by name.

import { createHmac } from "node:crypto";
import type { AnalyticsScope } from "./types";
import { ANONYMOUS_CUPPER_PREFIX, MIN_GROUP_SIZE_PLATFORM } from "./scope";

export interface CupperRow {
  cupperId?: string;
  cupperName?: string;
  /** True when the `cupper` dimension must not emit a bucket for this row. */
  cupperSuppressed?: boolean;
}

/** Keyed, domain-separated hash of a cupper id (own prefix, never equal to an email/claim key). */
export function cupperHash(id: string, secret: string): string {
  return createHmac("sha256", secret).update(`analytics-cupper:${id}`).digest("hex");
}

export interface CupperPrivacyOptions {
  secret: string;
  /** Submitted evaluations per cupper id in the WHOLE scope, unfiltered by the pivot's own filters. */
  totals: ReadonlyMap<string, number>;
}

export function anonymizeCuppers<T extends CupperRow>(
  rows: T[],
  scope: AnalyticsScope,
  opts?: CupperPrivacyOptions,
): (T & CupperRow)[] {
  if (scope.kind !== "platform") return rows as (T & CupperRow)[];
  if (!opts) throw new Error("cupper_privacy_options_missing");
  return rows.map((r) => {
    if (!r.cupperId) return r;
    const h = cupperHash(r.cupperId, opts.secret);
    return {
      ...r,
      cupperId: `c_${h.slice(0, 16)}`,
      cupperName: `${ANONYMOUS_CUPPER_PREFIX} ${h.slice(0, 4).toUpperCase()}`,
      cupperSuppressed: (opts.totals.get(r.cupperId) ?? 0) < MIN_GROUP_SIZE_PLATFORM,
    };
  });
}
