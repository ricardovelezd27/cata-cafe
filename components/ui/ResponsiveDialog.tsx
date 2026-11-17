"use client";

import { type ReactNode, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import styles from "./ResponsiveDialog.module.css";

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Optional secondary line under the title (e.g. stage name). */
  subtitle?: ReactNode;
  children: ReactNode;
  closeLabel: string;
  /** Optional handler for the visible X button only. Calling preventDefault()
   *  stops Radix from also firing onOpenChange(false), so a caller can treat
   *  the X differently from Escape / outside-click. */
  onCloseButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** The element that has focus now, if it is one focus can return to. */
function currentFocus(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const el = document.activeElement;
  return el instanceof HTMLElement && el !== document.body ? el : null;
}

/**
 * Accessible overlay built on @radix-ui/react-dialog: a centered modal on
 * desktop, a bottom sheet (~75vh) on mobile. Focus trap, Esc, scroll-lock and
 * portal come from Radix; the responsive shape lives in the CSS module.
 *
 * Focus goes back where it was (N3). The app opens its dialogs from its own
 * `open` state, never through a Radix `Dialog.Trigger`, and Radix then has no
 * trigger to return focus to: it lands on <body>. So the dialog remembers the
 * element that had focus when `open` turned true, read during that render
 * (before an `autoFocus` field inside the dialog takes focus in the commit),
 * and gives focus back to it once the dialog has closed (Radix's
 * `onCloseAutoFocus`, after the exit animation). If that element is no longer
 * in the page, Radix's default applies.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  closeLabel,
  onCloseButtonClick,
}: ResponsiveDialogProps) {
  // React's "state from the previous render" pattern: when `open` turns true,
  // note where focus is before the dialog takes it.
  const [wasOpen, setWasOpen] = useState(open);
  const [returnTo, setReturnTo] = useState<HTMLElement | null>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReturnTo(currentFocus());
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            if (returnTo?.isConnected) {
              event.preventDefault();
              returnTo.focus();
            }
            setReturnTo(null);
          }}
        >
          <div className={styles.grabber} aria-hidden />
          <div className={styles.header}>
            <div className={styles.titleBlock}>
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
            </div>
            <Dialog.Close
              className={styles.close}
              aria-label={closeLabel}
              onClick={onCloseButtonClick}
            >
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          <div className={styles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
