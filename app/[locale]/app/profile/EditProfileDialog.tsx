"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { ProfileForm } from "./ProfileForm";
import { Button } from "@/components/ui";

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
      <Button variant="secondary"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Pencil size={15} />
        {label}
      </Button>

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
