"use client";

import { useEffect, useState } from "react";

/**
 * True while the on-screen keyboard is (very likely) covering the viewport.
 *
 * Cross-platform rule, because iOS Safari ignores the `interactiveWidget`
 * viewport hint: a text field has focus AND `window.visualViewport` shrank
 * noticeably below the layout viewport. Both conditions are required — the
 * visual viewport also shrinks when Safari shows its toolbar and grows on
 * pinch-zoom, and neither should collapse the cupping chrome.
 *
 * Desktop never satisfies the shrink condition, so the hook is a no-op there.
 */
export function useKeyboardOpen(minShrinkPx = 120): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;

    const isTextTarget = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "INPUT") {
        const type = (el as HTMLInputElement).type;
        return !["checkbox", "radio", "button", "submit", "range", "file"].includes(type);
      }
      return el.isContentEditable;
    };

    const compute = () => {
      if (!isTextTarget()) {
        setOpen(false);
        return;
      }
      const visual = vv ? vv.height : window.innerHeight;
      const shrink = window.innerHeight - visual;
      setOpen(shrink >= minShrinkPx);
    };

    // visualViewport fires resize for the keyboard on iOS and Android alike;
    // focus events catch the blur (keyboard dismissed) before the next resize.
    vv?.addEventListener("resize", compute);
    window.addEventListener("resize", compute);
    document.addEventListener("focusin", compute);
    // activeElement is still the old field during focusout; re-check after.
    const onFocusOut = () => {
      window.setTimeout(compute, 0);
    };
    document.addEventListener("focusout", onFocusOut);
    compute();

    return () => {
      vv?.removeEventListener("resize", compute);
      window.removeEventListener("resize", compute);
      document.removeEventListener("focusin", compute);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [minShrinkPx]);

  return open;
}
