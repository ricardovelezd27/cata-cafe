"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A boolean persisted in localStorage, safe for SSR (server snapshot = the
 * default) and for blocked storage (reads/writes are try/catch'd, the value
 * then lives in memory for the page's lifetime). Tabs stay in sync through
 * the `storage` event; same-tab writers through a tiny subscriber set.
 *
 * `on`/`off` are the stored strings, so a flag can default to ON and still
 * record an explicit opt-out ("off"), e.g. the warm-up sound.
 */
const listeners = new Set<() => void>();
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* blocked storage */
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* blocked storage: memory copy only */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useLocalFlag(
  key: string,
  defaultValue: boolean,
  strings: { on: string; off: string } = { on: "1", off: "0" },
): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const raw = read(key);
      if (raw === strings.on) return true;
      if (raw === strings.off) return false;
      return defaultValue;
    },
    () => defaultValue,
  );
  const set = useCallback((next: boolean) => write(key, next ? strings.on : strings.off), [key, strings.on, strings.off]);
  return [value, set];
}
