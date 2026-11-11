// Platform seam (S8-15). The ONLY place that sniffs whether the app runs inside
// a native shell (Capacitor). Everything else asks this module. Client-only,
// SSR-safe: on the server it reports "not native". `win` is injectable for tests.

type CapacitorLike = { isNativePlatform?: () => boolean };
export type PlatformWindow = {
  Capacitor?: CapacitorLike;
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
};

function defaultWin(): PlatformWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as PlatformWindow);
}

export function isNativeShell(win: PlatformWindow | undefined = defaultWin()): boolean {
  try {
    return win?.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** Installed PWA (iOS "standalone" or display-mode: standalone) or native shell. */
export function isStandalone(win: PlatformWindow | undefined = defaultWin()): boolean {
  if (!win) return false;
  if (isNativeShell(win)) return true;
  try {
    if (win.navigator?.standalone === true) return true;
    return win.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    return false;
  }
}
