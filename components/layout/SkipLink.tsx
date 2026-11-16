"use client";

import type { MouseEvent } from "react";
import { useShellCovered } from "@/hooks/useShellLayer";

/** The id of the app shell's `<main>`, the skip link's target. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * "Saltar al contenido" (H-06): the first Tab stop of the app shell, hidden
 * until it has focus, moving focus to the page's own content.
 *
 * The click moves focus itself instead of letting the browser follow the
 * `#main-content` fragment, so the URL never changes and no `popstate` /
 * `hashchange` reaches a page's navigation guard. The `href` stays for the
 * no-script case. Inert, like the rest of the shell, under the cupping layer.
 */
export function SkipLink({ label }: { label: string }) {
  const covered = useShellCovered();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return;
    e.preventDefault();
    // Focusable only for this jump: a permanent tabindex on <main> would make
    // every click on its empty space move focus there. The next Tab then
    // starts from the top of the page's content.
    if (!main.hasAttribute("tabindex")) {
      main.setAttribute("tabindex", "-1");
      main.addEventListener("blur", () => main.removeAttribute("tabindex"), { once: true });
    }
    main.focus({ preventScroll: true });
  };

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={onClick}
      inert={covered}
      className="skip-link"
    >
      {label}
    </a>
  );
}
