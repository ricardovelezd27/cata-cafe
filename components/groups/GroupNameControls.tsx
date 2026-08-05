"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, Trash2 } from "lucide-react";
import { updateGroup, deleteGroup } from "@/app/actions/groups";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    start(async () => {
      try {
        await updateGroup(groupId, { name: trimmed, description: descValue.trim() || null });
        setEditing(false);
        router.refresh();
      } catch {
        setError(t.errorGeneric);
      }
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
          <label className="sr-only">{t.groupName}</label>
          <input
            autoFocus
            className="w-full px-3 py-2 border border-outline-variant rounded-input text-lg font-display bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary-container"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
            {t.descriptionLabel}
          </label>
          <textarea
            className="w-full px-3 py-2 border border-outline-variant rounded-input text-sm bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary-container min-h-[72px]"
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            placeholder={t.descriptionPlaceholder}
            maxLength={500}
          />
        </div>
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill bg-primary-container text-white text-sm font-semibold disabled:opacity-50"
        >
          <Check size={16} /> {t.saveDetails}
        </button>
        {error && <p className="text-xs text-error">{error}</p>}
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className="min-w-0">
            <h1 className="font-display text-3xl text-primary-container font-semibold truncate">{name}</h1>
            <p className="text-sm text-on-surface-variant mt-1">{description || t.noDescription}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setValue(name);
              setDescValue(description ?? "");
              setEditing(true);
            }}
            title={t.editDetails}
            className="p-1.5 text-on-surface-variant hover:text-primary-container transition-colors shrink-0"
          >
            <Pencil size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill border border-outline-variant text-sm font-semibold text-error hover:bg-error-container transition-colors disabled:opacity-50 shrink-0"
        >
          <Trash2 size={16} /> {t.delete}
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}

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
