"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Keeps the screen on while `active` (the warm-up player runs with the phone
 * on a table). Acquires `navigator.wakeLock.request("screen")`, releases it
 * when inactive or on unmount, and re-acquires when the tab becomes visible
 * again (the browser drops the lock on hide). `denied` is true when the API
 * is missing or the last request was rejected (low battery, policy, iOS < 16.4).
 * SSR-safe (server: not denied, not held) and StrictMode-safe (the effect
 * releases whatever it acquired).
 */
type Sentinel = { release(): Promise<void>; addEventListener(t: "release", cb: () => void): void };
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

const noopSubscribe = () => () => {};
const wakeLockApi = (): WakeLockApi | null =>
  typeof navigator !== "undefined" ? ((navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock ?? null) : null;

export function useWakeLock(active: boolean): { denied: boolean; held: boolean } {
  const missing = useSyncExternalStore(noopSubscribe, () => wakeLockApi() === null, () => false);
  const [rejected, setRejected] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const api = wakeLockApi();
    if (!active || !api) return;
    let cancelled = false;
    let sentinel: Sentinel | null = null;

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== "visible") return;
      try {
        const s = await api.request("screen");
        if (cancelled) {
          void s.release().catch(() => {});
          return;
        }
        sentinel = s;
        setHeld(true);
        setRejected(false);
        // Fires on our own release (cleanup) and when the browser drops the
        // lock (tab hidden); the visibility handler re-acquires.
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
          setHeld(false);
        });
      } catch {
        if (!cancelled) setRejected(true);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const s = sentinel;
      sentinel = null;
      if (s) void s.release().catch(() => {});
    };
  }, [active]);

  return { denied: missing || rejected, held: active && held };
}
