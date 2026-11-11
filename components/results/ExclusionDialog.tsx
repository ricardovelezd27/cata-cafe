"use client";

/**
 * Asks WHY a cupper is being excluded from the group results (S8-12,
 * F-resultados-5). The reason comes from a fixed list (lib/exclusionReasons.ts)
 * so it can be validated server-side and printed in reports. Built on the
 * shared ConfirmDialog; a refused write keeps the dialog open (the caller shows
 * the localized toast through useActionFeedback).
 */

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EXCLUSION_REASONS, type ExclusionReason } from "@/lib/exclusionReasons";

export type ExclusionDialogTranslations = {
  title: string;
  body: string;
  reasonLabel: string;
  confirm: string;
  cancel: string;
  close: string;
  reasons: Record<string, string>;
};

export function ExclusionDialog({
  open,
  onOpenChange,
  cupperName,
  onConfirm,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cupperName: string;
  /** Resolve with `{ ok: false }` to keep the dialog open; `undefined`/ok closes it. */
  onConfirm: (reason: ExclusionReason) => Promise<{ ok: boolean } | void>;
  t: ExclusionDialogTranslations;
}) {
  const [reason, setReason] = useState<ExclusionReason | null>(null);

  // Start every opening from a blank choice (adjusting state during render).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setReason(null);
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${t.title}: ${cupperName}`}
      body={
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm text-on-surface-variant">{t.body}</legend>
          <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            {t.reasonLabel}
          </span>
          {EXCLUSION_REASONS.map((r) => (
            <label
              key={r}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-input border border-outline-variant px-3 text-sm text-on-surface has-[:checked]:border-primary-container has-[:checked]:bg-primary-fixed"
            >
              <input
                type="radio"
                name="exclusion-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="h-4 w-4 accent-primary-container"
              />
              {t.reasons[r] ?? r}
            </label>
          ))}
        </fieldset>
      }
      confirmLabel={t.confirm}
      cancelLabel={t.cancel}
      closeLabel={t.close}
      destructive={false}
      confirmDisabled={reason === null}
      onConfirm={async () => {
        if (reason === null) return { ok: false };
        return onConfirm(reason);
      }}
    />
  );
}
