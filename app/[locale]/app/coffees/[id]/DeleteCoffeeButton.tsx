"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteCoffee } from "@/app/actions/coffees";
import { ConfirmDialog } from "@/components/ui";

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

  const handleConfirm = async () => {
    await deleteCoffee(coffeeId, locale);
    router.push(`/${locale}/app/coffees`);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-error transition-colors"
      >
        <Trash2 size={15} />
        {label}
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t.title}
        body={t.body}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        closeLabel={t.cancel}
        onConfirm={handleConfirm}
        error={t.error}
      />
    </>
  );
}
