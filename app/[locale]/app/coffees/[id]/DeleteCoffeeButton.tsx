"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteCoffee } from "@/app/actions/sessions";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";

export type DeleteCoffeeTranslations = {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  error: string;
};

export function DeleteCoffeeButton({
  coffeeId,
  locale,
  label,
  translations: t,
}: {
  coffeeId: string;
  locale: string;
  /** Trigger button text (generic "Eliminar" / "Delete" action label). */
  label: string;
  translations: DeleteCoffeeTranslations;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const handleConfirm = () => {
    setError(false);
    start(async () => {
      try {
        await deleteCoffee(coffeeId, locale);
        router.push(`/${locale}/app/coffees`);
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
        onClick={() => {
          setError(false);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-error transition-colors"
      >
        <Trash2 size={15} />
        {label}
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
