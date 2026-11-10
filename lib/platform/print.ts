import { isNativeShell } from "./env";
import type { PlatformResult } from "./files";

/** window.print() on the web. TODO(native): share the CVA PDF instead (print dialogs do not exist in a WebView). */
export function printPage(): PlatformResult {
  try {
    if (typeof window === "undefined") return { ok: false, via: "none" };
    if (isNativeShell()) return { ok: false, via: "native" };
    window.print();
    return { ok: true, via: "anchor" };
  } catch {
    return { ok: false, via: "none" };
  }
}
