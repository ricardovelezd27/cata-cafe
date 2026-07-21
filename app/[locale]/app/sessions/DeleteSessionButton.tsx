"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteSession } from "@/app/actions/sessions";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";

export type DeleteSessionTranslations = {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  error: string;
};

export function DeleteSessionButton({
  sessionId,
  locale,
  translations: t,
}: {
  sessionId: string;
  locale: string;
  translations: DeleteSessionTranslations;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(false);
    setOpen(true);
  };

  const handleConfirm = () => {
    setError(false);
    start(async () => {
      try {
        await deleteSession(sessionId, locale);
        setOpen(false);
        router.refresh();
      } catch {
        setError(true);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={t.title}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-sm text-on-surface-variant hover:text-error hover:bg-error-container/40 transition-colors"
      >
        <Trash2 size={15} />
      </button>

      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title={t.title}
        closeLabel={t.cancel}
      >
        <div className="space-y-5">
          <p className="text-sm text-on-surface">{t.body}</p>
          {error && <p className="text-sm text-error">{t.error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="px-5 py-2.5 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleConfirm}
              className="bg-error text-white rounded-pill px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-colors disabled:opacity-50"
            >
              {t.confirm}
            </button>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
