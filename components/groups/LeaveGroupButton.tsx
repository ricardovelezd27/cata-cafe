"use client";

// Member self-service exit — owner never sees this (owner deletes the group
// instead; leaveGroup throws owner_cannot_leave server-side as a backstop).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { leaveGroup } from "@/app/actions/groups";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export type LeaveGroupTranslations = {
  cta: string;
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  error: string;
};

export function LeaveGroupButton({
  groupId,
  locale,
  t,
}: {
  groupId: string;
  locale: string;
  t: LeaveGroupTranslations;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleConfirm = async () => {
    await leaveGroup(groupId);
    router.push(`/${locale}/app/groups`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-pill border border-outline-variant px-4 py-2 text-sm font-medium text-error transition-colors hover:bg-error-container"
      >
        <LogOut size={16} /> {t.cta}
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
