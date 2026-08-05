"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { ProfileForm } from "./ProfileForm";

type ProfileFormProps = Parameters<typeof ProfileForm>[0];

/** "Editar perfil" trigger + modal. The profile page stays read-only; every
 *  editable field lives in this dialog (LinkedIn-style edit affordance). */
export function EditProfileDialog({
  label,
  closeLabel,
  form,
}: {
  label: string;
  closeLabel: string;
  form: ProfileFormProps;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-pill border border-primary-container px-4 py-2 text-sm font-semibold text-primary-container transition-colors hover:bg-primary-fixed"
      >
        <Pencil size={15} />
        {label}
      </button>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        closeLabel={closeLabel}
      >
        <ProfileForm {...form} />
      </ResponsiveDialog>
    </>
  );
}
