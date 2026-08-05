"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteSession } from "@/app/actions/sessions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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

  const handleConfirm = async () => {
    await deleteSession(sessionId, locale);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={t.title}
        className="inline-flex rounded-sm p-1.5 text-on-surface-variant transition-colors hover:text-error"
      >
        <Trash2 size={16} />
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
