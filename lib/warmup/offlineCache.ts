// Pure helpers for caching the cup screen's warm-up props for an offline
// rebuild (S8-09, F-movimiento-sensorial-4). The cached copy keeps only what is
// static (exercise id, copy); the live synced-run clock is never cached: a
// stale `warmupStartedAt` or `serverNow` would replay a long-finished run.

type WarmupLike = {
  exerciseId: string | null;
  hasOwnEvaluation: boolean;
  warmupStartedAt: string | null;
  serverNow: string;
};

export type CachedWarmup<W extends WarmupLike> = Omit<W, "warmupStartedAt" | "serverNow">;

/** What `cacheProps` stores. */
export function warmupForCache<W extends WarmupLike>(
  warmup: W | undefined,
): CachedWarmup<W> | null {
  if (!warmup) return null;
  const { warmupStartedAt: _startedAt, serverNow: _serverNow, ...rest } = warmup;
  void _startedAt;
  void _serverNow;
  return rest;
}

/**
 * Rebuild the `warmup` prop for the offline cup screen. `hasLocalWork` = the
 * device already holds a draft for this session, so the cupper is "returning"
 * and the overlay gate (lib/warmup/overlayGate.ts) stays closed, exactly as it
 * would online. No synced run is ever resumed from cache.
 */
export function warmupFromCache<W extends WarmupLike>(
  cached: CachedWarmup<W> | null | undefined,
  opts: { hasLocalWork: boolean; nowIso: string },
): W | undefined {
  if (!cached) return undefined;
  return {
    ...cached,
    hasOwnEvaluation: cached.hasOwnEvaluation || opts.hasLocalWork,
    warmupStartedAt: null,
    serverNow: opts.nowIso,
  } as unknown as W;
}
