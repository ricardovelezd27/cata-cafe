// Client-only helpers for per-device state that must not survive a sign-out.
// Kept separate from lib/offline/store.ts (which is user-keyed and must
// survive) so the boundary is explicit.

const SW_CACHE_PREFIXES = ["cata-pages-", "cata-rsc-"];

/** Drops the service worker's per-user page/RSC caches. Static asset caches
 *  (`cata-static-*`) are shared and kept; evaluation drafts are user-keyed
 *  in IndexedDB and kept so an unsynced draft is never destroyed. Never
 *  throws — a browser without the Cache API just skips. */
export async function clearLocalDeviceState(): Promise<void> {
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
  try {
    const { forgetLastUser } = await import("@/lib/offline/store");
    await forgetLastUser();
  } catch {
    // the store may be unavailable in this browser
  }
}
