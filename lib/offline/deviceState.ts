// Client-only helpers for per-device state that must not survive a sign-out.
// Kept separate from lib/offline/store.ts (which is user-keyed and must
// survive) so the boundary is explicit.

const SW_CACHE_PREFIXES = ["cata-pages-", "cata-rsc-"];

/** Drops only the per-user page/RSC caches (never throws). */
export async function purgePageCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => SW_CACHE_PREFIXES.some((p) => k.startsWith(p)))
          .map((k) => caches.delete(k)),
      );
    }
  } catch {
    // best effort
  }
}

/** App-shell mount (S8-09, F-offline-9): when the signed-in id differs from the
 *  one this device last served, the previous user's cached pages must not be
 *  reachable offline. Purges the page/RSC caches, then records the new user. */
export async function purgeCachesOnUserChange(userId: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { getLastUser, rememberUser } = await import("@/lib/offline/store");
    const last = await getLastUser();
    const changed = !!last && last !== userId;
    if (changed) await purgePageCaches();
    if (last !== userId) await rememberUser(userId);
    return changed;
  } catch {
    return false;
  }
}

/** Drops the service worker's per-user page/RSC caches. Static asset caches
 *  (`cata-static-*`) are shared and kept; evaluation drafts are user-keyed
 *  in IndexedDB and kept so an unsynced draft is never destroyed. Never
 *  throws — a browser without the Cache API just skips. */
export async function clearLocalDeviceState(
  opts: { keepClaimInProgress?: boolean } = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  await purgePageCaches();
  try {
    // A pending guest-claim hand-over must not outlive the sign-out, except
    // on the "use another account" step of a claim in progress (C-08).
    const { claimKeysToClear } = await import("@/lib/offline/claimMarker");
    for (const key of claimKeysToClear(opts)) window.localStorage.removeItem(key);
  } catch {
    // best effort
  }
  try {
    const { forgetLastUser } = await import("@/lib/offline/store");
    await forgetLastUser();
  } catch {
    // the store may be unavailable in this browser
  }
  try {
    // Session-moment seen-set (warm-up "shown once"): per user, but a shared
    // tablet must not carry one cupper's moments into the next sign-in.
    const { clearMomentsForDevice } = await import("@/lib/sessionMoments");
    clearMomentsForDevice();
  } catch {
    // best effort
  }
  try {
    // Legacy unkeyed warm-up reflection notes (no longer written, S8-13).
    const { purgeLegacyReflections } = await import("@/lib/warmup/reflections");
    purgeLegacyReflections(window.localStorage);
  } catch {
    // best effort
  }
  try {
    // The optional cupping timer's start timestamps (S10 WP3b): per user, same shared-tablet rule.
    const { clearTimerKeys } = await import("@/lib/cuppingTimer");
    clearTimerKeys(window.localStorage);
  } catch {
    // best effort
  }
  try {
    // Unsent session-wizard drafts (S8-10 T3): per user, same shared-tablet rule.
    const { clearWizardDrafts } = await import("@/lib/wizardDraft");
    clearWizardDrafts(window.localStorage);
  } catch {
    // best effort
  }
}
