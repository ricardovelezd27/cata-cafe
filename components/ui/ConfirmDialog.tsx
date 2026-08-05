"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ResponsiveDialog } from "./ResponsiveDialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  closeLabel,
  onConfirm,
  destructive = true,
  error,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  onConfirm: () => Promise<void> | void;
  destructive?: boolean;
  error?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  // Clear a stale failure banner whenever the dialog transitions from
  // closed to open (but not while it stays open after a failed attempt).
  // Adjusting state during render (not in an effect) per React's guidance:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setFailed(false);
  }

  const handleOpenChange = (next: boolean) => {
    if (isPending) return;
    onOpenChange(next);
  };

  const handleConfirm = () => {
    setFailed(false);
    startTransition(async () => {
      try {
        await onConfirm();
        onOpenChange(false);
      } catch {
        setFailed(true);
      }
    });
  };

  const showError = failed && !!error;

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange} title={title} closeLabel={closeLabel}>
      <div className="space-y-5">
        <div className="text-sm text-on-surface">{body}</div>
        {showError && <p className="text-sm text-error">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleOpenChange(false)}
            className="px-5 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleConfirm}
            className={
              destructive
                ? "rounded-pill bg-error px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-error/90 disabled:opacity-50"
                : "rounded-pill bg-primary-container px-5 py-2.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary disabled:opacity-50"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
