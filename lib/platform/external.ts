import { isNativeShell } from "./env";
import type { PlatformResult } from "./files";

/** Open a URL outside the app. TODO(native): Browser.open({ url }) from @capacitor/browser. */
export function openExternal(url: string): PlatformResult {
  try {
    if (typeof window === "undefined") return { ok: false, via: "none" };
    if (isNativeShell()) return { ok: false, via: "native" };
    window.open(url, "_blank", "noopener");
    return { ok: true, via: "anchor" };
  } catch {
    return { ok: false, via: "none" };
  }
}
