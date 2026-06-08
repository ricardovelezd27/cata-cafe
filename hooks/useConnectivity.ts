"use client";

import { useEffect, useRef, useState } from "react";

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 8_000;

// Two-layer connectivity detection.
//   Layer 1: navigator.onLine + online/offline events (fast, but lies on
//            captive-portal / hotel WiFi where the radio is "connected").
//   Layer 2: every 30s, probe GET /api/health. A failed probe forces offline
//            regardless of navigator.onLine; a successful probe forces online.
//
// Returns the current `online` flag. The boolean flips drive the offline banner
// and trigger sync-on-reconnect (see useOfflineSync).
export function useConnectivity(): { online: boolean } {
  // Default true on first render to avoid a hydration flash / banner blink;
  // the first probe corrects it within a tick.
  const [online, setOnline] = useState(true);
  const onlineRef = useRef(true);

  const update = (next: boolean) => {
    if (onlineRef.current === next) return;
    onlineRef.current = next;
    setOnline(next);
  };

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      // navigator.onLine === false is authoritative for "definitely offline";
      // skip the network round-trip in that case.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        update(false);
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      try {
        const res = await fetch("/api/health", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!cancelled) update(res.ok);
      } catch {
        if (!cancelled) update(false);
      } finally {
        clearTimeout(timer);
      }
    };

    // Browser events give us an instant signal; the probe confirms reality.
    const onOnline = () => void ping();
    const onOffline = () => update(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    void ping();
    const interval = setInterval(() => void ping(), PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { online };
}
