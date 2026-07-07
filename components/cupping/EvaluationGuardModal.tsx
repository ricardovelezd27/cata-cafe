"use client";

import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";

export type GuardItem = {
  /** Sample label — omitted for the single-sample next-sample guard. */
  sample?: string;
  /** Human-readable section names already resolved via translations. */
  sections: string[];
};

export type EvaluationGuardTranslations = {
  review: string;
  confirm: string;
};

// Non-destructive "you missed X" confirmation. Mirrors SyncConflictModal: a
// ResponsiveDialog with a secondary (go back) and primary (proceed) action.
export function EvaluationGuardModal({
  open,
  title,
  body,
  items,
  onCancel,
  onConfirm,
  translations: t,
}: {
  open: boolean;
  title: string;
  body: string;
  items: GuardItem[];
  onCancel: () => void;
  onConfirm: () => void;
  translations: EvaluationGuardTranslations;
}) {
  if (!open) return null;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={title}
      closeLabel={t.review}
    >
      <div className="space-y-5">
        <p className="font-sans text-sm text-brown-dark">{body}</p>

        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="font-sans text-sm text-brown-dark">
              {item.sample && (
                <span className="font-semibold">{item.sample}: </span>
              )}
              <span className="text-brown-mid">
                {item.sections.join(", ")}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-brown-light font-sans text-sm text-brown-dark hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t.review}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-md bg-green-dark font-sans text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
