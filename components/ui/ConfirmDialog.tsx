"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ResponsiveDialog } from "./ResponsiveDialog";
import type { ActionResult } from "@/lib/actionResult";

// Backwards-compatible: existing callers return Promise<void> | void and keep
// throwing on failure. Newer callers may return an ActionResult (or a
// loosely-typed `{ ok, error }` shape) instead of throwing — when `ok` is
// false, the dialog shows the mapped message from `errorMessages` (falling
// back to the plain `error` prop) instead of closing.
type ConfirmOutcome = ActionResult<unknown> | { ok: boolean; error?: string } | void;

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
  errorMessages,
  confirmDisabled = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  onConfirm: () => Promise<ConfirmOutcome> | ConfirmOutcome;
  destructive?: boolean;
  error?: string | null;
  /** Maps an ActionErrorCode (or any string error code) to display copy. */
  errorMessages?: Record<string, string>;
  /** Disables the confirm button — e.g. while async impact data is still loading. */
  confirmDisabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [resolvedError, setResolvedError] = useState<string | null>(null);

  // Clear a stale failure banner whenever the dialog transitions from
  // closed to open (but not while it stays open after a failed attempt).
  // Adjusting state during render (not in an effect) per React's guidance:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFailed(false);
      setResolvedError(null);
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (isPending) return;
    onOpenChange(next);
  };

  const handleConfirm = () => {
    setFailed(false);
    setResolvedError(null);
    startTransition(async () => {
      try {
        const result = await onConfirm();
        if (result && typeof result === "object" && "ok" in result && result.ok === false) {
          const code = "error" in result ? result.error : undefined;
          const mapped = code ? errorMessages?.[code] ?? errorMessages?.unknown : undefined;
          setResolvedError(mapped ?? null);
          setFailed(true);
          return;
        }
        onOpenChange(false);
      } catch {
        setFailed(true);
      }
    });
  };

  const showError = failed && !!(resolvedError ?? error);

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange} title={title} closeLabel={closeLabel}>
      <div className="space-y-5">
        <div className="text-sm text-on-surface">{body}</div>
        {showError && <p className="text-sm text-error">{resolvedError ?? error}</p>}
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
            disabled={isPending || confirmDisabled}
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
