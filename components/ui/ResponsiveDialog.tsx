"use client";

import { type ReactNode } from "react";
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
}

/**
 * Accessible overlay built on @radix-ui/react-dialog: a centered modal on
 * desktop, a bottom sheet (~75vh) on mobile. Focus trap, Esc, scroll-lock and
 * portal come from Radix; the responsive shape lives in the CSS module.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  closeLabel,
}: ResponsiveDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <div className={styles.grabber} aria-hidden />
          <div className={styles.header}>
            <div className={styles.titleBlock}>
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
            </div>
            <Dialog.Close className={styles.close} aria-label={closeLabel}>
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          <div className={styles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
