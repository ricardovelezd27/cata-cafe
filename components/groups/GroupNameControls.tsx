"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, Trash2 } from "lucide-react";
import { updateGroup, deleteGroup } from "@/app/actions/groups";
import { useActionFeedback } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";

export function GroupNameControls({
  groupId,
  name,
  description,
  locale,
  t,
}: {
  groupId: string;
  name: string;
  description: string | null;
  locale: string;
  t: {
    editDetails: string;
    delete: string;
    confirmDelete: string;
    saveDetails: string;
    groupName: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    noDescription: string;
    errorGeneric: string;
    cancel: string;
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [descValue, setDescValue] = useState(description ?? "");
  const feedback = useActionFeedback();
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, start] = useTransition();
  const uid = useId();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    start(async () => {
      await feedback.run(
        updateGroup(groupId, { name: trimmed, description: descValue.trim() || null }),
        () => {
          setEditing(false);
          router.refresh();
        },
      );
    });
  };

  const handleDeleteConfirm = async () => {
    await deleteGroup(groupId);
    router.push(`/${locale}/app/groups`);
  };

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-name`} className="sr-only">
            {t.groupName}
          </label>
          <input
            id={`${uid}-name`}
            autoFocus
            className="min-h-[44px] w-full px-3 py-2 border border-outline-variant rounded-input text-card font-display bg-surface-container-lowest text-on-surface focus:border-primary-container"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor={`${uid}-description`}
            className="label-caps block"
          >
            {t.descriptionLabel}
          </label>
          <textarea
            id={`${uid}-description`}
            className="w-full px-3 py-2 border border-outline-variant rounded-input text-body bg-surface-container-lowest text-on-surface focus:border-primary-container min-h-[72px]"
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            placeholder={t.descriptionPlaceholder}
            maxLength={500}
          />
        </div>
        <Button size="sm"
          type="submit"
          disabled={pending || !value.trim()}
        >
          <Check size={16} /> {t.saveDetails}
        </Button>
        {error && <p className="text-caption text-error">{error}</p>}
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className="min-w-0">
            <h1 className="page-title truncate">{name}</h1>
            <p className="text-body text-on-surface-variant mt-1">{description || t.noDescription}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setValue(name);
              setDescValue(description ?? "");
              setEditing(true);
            }}
            title={t.editDetails}
            aria-label={t.editDetails}
            className="inline-flex h-[44px] w-[44px] items-center justify-center text-on-surface-variant hover:text-primary-container transition-colors shrink-0"
          >
            <Pencil size={16} aria-hidden />
          </button>
        </div>
        <Button variant="danger" size="sm"
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={pending}
        >
          <Trash2 size={16} aria-hidden /> {t.delete}
        </Button>
      </div>
      {error && <p className="text-caption text-error">{error}</p>}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t.delete}
        body={t.confirmDelete}
        confirmLabel={t.delete}
        cancelLabel={t.cancel}
        closeLabel={t.cancel}
        onConfirm={handleDeleteConfirm}
        error={t.errorGeneric}
      />
    </div>
  );
}
