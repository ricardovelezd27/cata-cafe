"use client";

// S10 WP4b (Kim C1, `TODO(kim-validar:C1)`): the owner's close dialog with three
// choices: close now (today's behaviour), or announce the close 2 or 5 minutes
// ahead. The body (what closing leaves out) is supplied by the caller and is
// the same text the old confirm dialog showed.

import { useState, type ReactNode } from "react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import type { ActionResult } from "@/lib/actionResult";
import type { AnnounceMinutes } from "@/lib/closeAnnounce";

export type CloseSessionDialogTranslations = {
  title: string;
  closeNow: string;
  announce2: string;
  announce5: string;
  hint: string;
  cancel: string;
  close: string;
  /** Shown when closing now failed. */
  closeError: string;
  /** Shown when announcing failed. */
  announceError: string;
};

export function CloseSessionDialog({
  open,
  onOpenChange,
  body,
  confirmDisabled = false,
  onCloseNow,
  onAnnounce,
  translations: t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  body: ReactNode;
  /** True while the impact numbers are still loading. */
  confirmDisabled?: boolean;
  /** Same close as before; throws on failure. */
  onCloseNow: () => Promise<unknown>;
  onAnnounce: (minutes: AnnounceMinutes) => Promise<ActionResult<unknown>>;
  translations: CloseSessionDialogTranslations;
}) {
  const [pending, setPending] = useState<"now" | AnnounceMinutes | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear a stale error when the dialog opens again (adjusted during render).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setError(null);
  }

  const run = async (kind: "now" | AnnounceMinutes) => {
    setPending(kind);
    setError(null);
    try {
      if (kind === "now") {
        await onCloseNow();
        onOpenChange(false);
      } else {
        const r = await onAnnounce(kind);
        if (r.ok) onOpenChange(false);
        else setError(t.announceError);
      }
    } catch {
      setError(kind === "now" ? t.closeError : t.announceError);
    } finally {
      setPending(null);
    }
  };

  const busy = pending !== null;
  const secondary =
    "min-h-[44px] rounded-pill border border-outline-variant px-5 py-2.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-50";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      title={t.title}
      closeLabel={t.close}
    >
      <div className="space-y-5">
        <div className="text-sm text-on-surface">{body}</div>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || confirmDisabled}
            onClick={() => void run("now")}
            className="min-h-[44px] rounded-pill bg-error px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-error/90 disabled:opacity-50"
          >
            {t.closeNow}
          </button>
          <button
            type="button"
            disabled={busy || confirmDisabled}
            onClick={() => void run(2)}
            className={secondary}
          >
            {t.announce2}
          </button>
          <button
            type="button"
            disabled={busy || confirmDisabled}
            onClick={() => void run(5)}
            className={secondary}
          >
            {t.announce5}
          </button>
          <p className="text-xs text-on-surface-variant">{t.hint}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="min-h-[44px] px-5 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
