"use client";

import { useSyncExternalStore } from "react";
import { isNativeShell } from "@/lib/platform/env";

const subscribe = () => () => {};

/** Hydration-safe: false on the server and first paint, true only inside a native shell. */
export function useIsNativeShell(): boolean {
  return useSyncExternalStore(subscribe, () => isNativeShell(), () => false);
}
