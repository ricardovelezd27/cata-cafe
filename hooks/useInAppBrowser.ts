"use client";

import { useSyncExternalStore } from "react";
import { currentInAppBrowser, type InAppBrowser } from "@/lib/platform/inAppBrowser";

const subscribe = () => () => {};

/** Hydration-safe: null on the server and first paint. */
export function useInAppBrowser(): InAppBrowser | null {
  return useSyncExternalStore(subscribe, currentInAppBrowser, () => null);
}
