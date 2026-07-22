"use client";

import { useEffect } from "react";

// Registers public/sw.js so the app shell (static assets + last-seen pages)
// is available offline after one online visit.
//
// Production-only by default: dev relies on Turbopack HMR (websocket +
// on-demand chunk requests) which does not play well with a caching layer
// sitting in front of it. To test the service worker locally anyway, run in
// the browser console:
//   localStorage.setItem("cata_sw_dev", "1")
// then hard-reload. Remove the key (or use an incognito window) to go back
// to the normal, SW-free dev experience.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const isProd = process.env.NODE_ENV === "production";
    const devOverride =
      !isProd &&
      (() => {
        try {
          return window.localStorage.getItem("cata_sw_dev") === "1";
        } catch {
          return false;
        }
      })();

    if (!isProd && !devOverride) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
