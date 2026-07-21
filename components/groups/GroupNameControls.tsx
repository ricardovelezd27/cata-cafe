"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, Trash2 } from "lucide-react";
import { renameGroup, deleteGroup } from "@/app/actions/groups";

export function GroupNameControls({
  groupId,
  name,
  locale,
  t,
}: {
  groupId: string;
  name: string;
  locale: string;
  t: {
    rename: string;
    delete: string;
    confirmDelete: string;
    saveName: string;
    groupName: string;
    errorGeneric: string;
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    start(async () => {
      try {
        await renameGroup(groupId, trimmed);
        setEditing(false);
        router.refresh();
      } catch {
        setError(t.errorGeneric);
      }
    });
  };

  const onDelete = () => {
    if (!window.confirm(t.confirmDelete)) return;
    setError(null);
    start(async () => {
      try {
        await deleteGroup(groupId);
        router.push(`/${locale}/app/groups`);
      } catch {
        setError(t.errorGeneric);
      }
    });
  };

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-2">
        <label className="sr-only">{t.groupName}</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            className="flex-1 min-w-[180px] px-3 py-2 border border-[#D4C5A9] rounded-lg text-lg font-serif bg-white text-brown-dark focus:outline-none focus:border-green-dark"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={80}
          />
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-dark text-white text-sm font-semibold disabled:opacity-50"
          >
            <Check size={16} /> {t.saveName}
          </button>
        </div>
        {error && <p className="text-xs text-red-defect">{error}</p>}
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="font-serif text-3xl text-green-dark font-semibold truncate">{name}</h1>
          <button
            type="button"
            onClick={() => {
              setValue(name);
              setEditing(true);
            }}
            title={t.rename}
            className="p-1.5 text-brown-mid hover:text-green-dark transition-colors shrink-0"
          >
            <Pencil size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D4C5A9] text-sm font-semibold text-red-defect hover:bg-[#EBE0E0] transition-colors disabled:opacity-50 shrink-0"
        >
          <Trash2 size={16} /> {t.delete}
        </button>
      </div>
      {error && <p className="text-xs text-red-defect">{error}</p>}
    </div>
  );
}
