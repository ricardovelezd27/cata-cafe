"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { addMemberByUserId, createGroup } from "@/app/actions/groups";

export type GroupOption = { id: string; name: string };

const NEW_GROUP_VALUE = "__new__";

export function AddToGroupButton({
  candidateUserId,
  groups,
  t,
}: {
  candidateUserId: string;
  groups: GroupOption[];
  t: {
    addToGroup: string;
    newGroupOption: string;
    namePlaceholder: string;
    create: string;
    added: string;
    errorGeneric: string;
  };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const handleSelect = (value: string) => {
    setError(null);
    setSelected(value);
    if (value === NEW_GROUP_VALUE) {
      setCreating(true);
      return;
    }
    if (!value) return;
    start(async () => {
      try {
        await addMemberByUserId(value, candidateUserId);
        setAdded(true);
        setSelected("");
        router.refresh();
        setTimeout(() => setAdded(false), 2000);
      } catch {
        setError(t.errorGeneric);
      }
    });
  };

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setError(null);
    start(async () => {
      try {
        const { groupId } = await createGroup({ name: trimmed });
        await addMemberByUserId(groupId, candidateUserId);
        setAdded(true);
        setNewName("");
        setCreating(false);
        setSelected("");
        router.refresh();
        setTimeout(() => setAdded(false), 2000);
      } catch {
        setError(t.errorGeneric);
      }
    });
  };

  if (added) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-dark">
        <Check size={16} /> {t.added}
      </span>
    );
  }

  if (creating) {
    return (
      <form onSubmit={handleCreateAndAdd} className="flex gap-2">
        <input
          autoFocus
          className="flex-1 min-w-0 px-2.5 py-1.5 border border-[#D4C5A9] rounded-lg text-xs bg-white text-brown-dark focus:outline-none focus:border-green-dark"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t.namePlaceholder}
          maxLength={80}
        />
        <button
          type="submit"
          disabled={pending || !newName.trim()}
          className="px-3 py-1.5 rounded-lg bg-green-dark text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
        >
          {t.create}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-1">
      <select
        value={selected}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={pending}
        className="w-full px-3 py-2 border border-[#D4C5A9] rounded-lg text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark disabled:opacity-50"
      >
        <option value="" disabled>
          {t.addToGroup}
        </option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
        <option value={NEW_GROUP_VALUE}>{t.newGroupOption}</option>
      </select>
      {error && <p className="text-xs text-red-defect">{error}</p>}
    </div>
  );
}
