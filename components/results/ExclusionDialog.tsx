"use client";

/**
 * Asks WHY a cupper is being excluded from the group results (S8-12,
 * F-resultados-5; list and free text per S10 WP5a, D2). The reason comes from a
 * fixed list (lib/exclusionReasons.ts) so it can be validated server-side and
 * printed in reports; "other" asks for a short free text. Built on the shared
 * ConfirmDialog; a refused write keeps the dialog open (the caller shows the
 * localized toast through useActionFeedback).
 *
 * TODO(kim-validar:D2)
 */

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  EXCLUSION_OTHER_MAX,
  EXCLUSION_REASONS,
  type ExclusionReason,
} from "@/lib/exclusionReasons";

export type ExclusionDialogTranslations = {
  title: string;
  body: string;
  /** Extra line shown only when the session has a sample scored under the previous rule. */
  note?: string | null;
  /** Shown only once the session is closed: summaries already sent keep the old number. */
  closedNote?: string | null;
  reasonLabel: string;
  /** Label of the short free text asked when the reason is "other". */
  otherLabel: string;
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
  onConfirm: (reason: ExclusionReason, otherText: string) => Promise<{ ok: boolean } | void>;
  t: ExclusionDialogTranslations;
}) {
  const [reason, setReason] = useState<ExclusionReason | null>(null);
  const [otherText, setOtherText] = useState("");

  // Start every opening from a blank choice (adjusting state during render).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setReason(null);
      setOtherText("");
    }
  }

  const missingText = reason === "other" && otherText.trim().length === 0;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${t.title}: ${cupperName}`}
      body={
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm text-on-surface-variant">{t.body}</legend>
          {t.note && <p className="text-sm text-on-surface-variant">{t.note}</p>}
          {t.closedNote && <p className="text-sm text-on-surface-variant">{t.closedNote}</p>}
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
          {reason === "other" && (
            <label className="flex flex-col gap-1 text-sm text-on-surface">
              <span className="text-xs font-semibold text-on-surface-variant">{t.otherLabel}</span>
              <input
                type="text"
                value={otherText}
                maxLength={EXCLUSION_OTHER_MAX}
                onChange={(e) => setOtherText(e.target.value)}
                className="min-h-[44px] rounded-input border border-outline-variant bg-surface px-3 text-sm text-on-surface"
              />
            </label>
          )}
        </fieldset>
      }
      confirmLabel={t.confirm}
      cancelLabel={t.cancel}
      closeLabel={t.close}
      destructive={false}
      confirmDisabled={reason === null || missingText}
      onConfirm={async () => {
        if (reason === null || missingText) return { ok: false };
        return onConfirm(reason, otherText.trim());
      }}
    />
  );
}
