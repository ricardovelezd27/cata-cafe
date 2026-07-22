"use client";

import { useState } from "react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import type { SyncConflict } from "@/lib/offline/types";

export type SyncConflictTranslations = {
  conflictTitle: string;
  conflictBody: string; // RAW template (via t.raw()) — contains "{sample}"
  conflictKeep: string;
  conflictReplace: string;
};

// Surfaces submit-conflicts one at a time: the server already holds a SUBMITTED
// evaluation for this sample (e.g. submitted from another device), so the user
// chooses keep-submitted vs replace-with-local.
export function SyncConflictModal({
  conflicts,
  onResolve,
  translations: t,
}: {
  conflicts: SyncConflict[];
  onResolve: (conflict: SyncConflict, replace: boolean) => Promise<void>;
  translations: SyncConflictTranslations;
}) {
  const [busy, setBusy] = useState(false);
  const conflict = conflicts[0];
  if (!conflict) return null;

  const resolve = async (replace: boolean) => {
    setBusy(true);
    try {
      await onResolve(conflict, replace);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={() => {
        /* require an explicit choice — no dismiss */
      }}
      title={t.conflictTitle}
      closeLabel={t.conflictKeep}
    >
      <div className="space-y-5">
        <p className="font-sans text-sm text-brown-dark">
          {t.conflictBody.replace("{sample}", conflict.sampleLabel)}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => resolve(false)}
            className="px-4 py-2 rounded-md border border-brown-light font-sans text-sm text-brown-dark hover:bg-cream disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t.conflictKeep}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => resolve(true)}
            className="px-4 py-2 rounded-md bg-green-dark font-sans text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t.conflictReplace}
          </button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
