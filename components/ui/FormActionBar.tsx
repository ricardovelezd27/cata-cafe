import type { ReactNode } from "react";
import styles from "./FormActionBar.module.css";

/**
 * The docked action bar of a long form (S7a, finding C-08 of the 2026-11-15
 * audit): the form's one submit, its error or pending line, always reachable at
 * the bottom of the screen instead of 800 to 1,000 px below a phone's fold.
 *
 * The `CanvasFooter` recipe, for forms: `position: sticky` at the bottom of the
 * page's own scroll (the app shell's `<main>`), above the phone's tab bar and
 * its safe-area inset, opaque `surface-container-lowest` with a hairline on the
 * edge that meets the form (DESIGN.md: a docked bar over a form does not blur).
 * `CanvasFooter` itself is the cupping screen's previous / next pair and is not
 * reused: this is the one bar for a form's submit.
 *
 * Rules the part keeps (tests/formActionBar.test.ts):
 *  - it is the LAST thing in the form, so Tab still ends on the submit, and at
 *    the end of the scroll it rests below the last field and covers nothing;
 *  - while it is docked over the form, a field that takes focus is scrolled
 *    clear of it: give the `<form>` the class `dockedFormClass`, and the page's
 *    scroll container reserves the room of the bar and of the tab bar
 *    (`scroll-padding-bottom`, through `main:has(...)`);
 *  - `status` is the form's own line (an error, "saved", "offline", a pending
 *    note): a polite live region, read when it changes.
 *
 * It lives inside the app shell's `<main>` (padding `p-4 lg:p-6`) and bleeds to
 * that padding so its hairline runs to the edges of the scroll area.
 */
export function FormActionBar({
  children,
  status,
}: {
  /** The submit (one primary), and at most a quieter companion. */
  children: ReactNode;
  /** The form's own error / pending / saved line, shown above the buttons. */
  status?: ReactNode;
}) {
  return (
    <div className={styles.bar} data-form-action-bar="">
      <div className={styles.status} aria-live="polite">
        {status}
      </div>
      <div className={styles.actions}>{children}</div>
    </div>
  );
}

/** Put on the `<form>` that holds a `FormActionBar`: while it is on the page,
 *  a field that takes focus is scrolled clear of the docked bar (and of the
 *  phone's tab bar). */
export const dockedFormClass = styles.form;
