"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { addMemberByUserId, createGroupWithMembers } from "@/app/actions/groups";
import { useActionFeedback } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

export type GroupOption = { id: string; name: string };

const NEW_GROUP_VALUE = "__new__";

export function AddToGroupButton({
  candidateUserId,
  candidateName,
  groups,
  t,
}: {
  candidateUserId: string;
  /** N2: the name the card shows, so the select says whom it adds. */
  candidateName: string;
  groups: GroupOption[];
  t: {
    addToGroup: string;
    newGroupOption: string;
    namePlaceholder: string;
    create: string;
    added: string;
    errorGeneric: string;
    /** N2: raw template with {name}; begins with the select's own visible text ("Añadir a grupo: {name}"). */
    addToGroupNamed: string;
    /** N2: visible label of the new group's name field. */
    groupName: string;
  };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [added, setAdded] = useState(false);
  const feedback = useActionFeedback();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const uid = useId();

  const handleSelect = (value: string) => {
    setError(null);
    setSelected(value);
    if (value === NEW_GROUP_VALUE) {
      setCreating(true);
      return;
    }
    if (!value) return;
    start(async () => {
      await feedback.run(addMemberByUserId(value, candidateUserId), () => {
        setAdded(true);
        setSelected("");
        router.refresh();
        setTimeout(() => setAdded(false), 2000);
      });
    });
  };

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setError(null);
    start(async () => {
      try {
        const created = await createGroupWithMembers({ name: trimmed, members: [] });
        if (!created.ok) throw new Error(created.error);
        const addResult = await addMemberByUserId(created.groupId, candidateUserId);
        if (!addResult.ok) {
          feedback.notifyError(addResult.error);
          router.refresh();
          return;
        }
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
      <span className="inline-flex items-center gap-1.5 text-caption font-medium text-primary-container">
        <Check size={16} /> {t.added}
      </span>
    );
  }

  if (creating) {
    return (
      <form onSubmit={handleCreateAndAdd} className="space-y-1.5">
        <label
          htmlFor={`${uid}-new-group`}
          className="label-caps block"
        >
          {t.groupName}
        </label>
        <div className="flex gap-2">
          <input
            id={`${uid}-new-group`}
            autoFocus
            className="min-h-[44px] flex-1 min-w-0 px-2.5 py-1.5 border border-outline-variant rounded-input text-caption bg-surface-container-lowest text-on-surface focus:border-primary-container"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.namePlaceholder}
            maxLength={80}
          />
          <Button size="sm"
            type="submit"
            disabled={pending || !newName.trim()}
          >
            {t.create}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-1">
      <select
        value={selected}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={pending}
        aria-label={t.addToGroupNamed.replace("{name}", candidateName)}
        className="min-h-[44px] w-full px-3 py-2 border border-outline-variant rounded-input text-caption bg-surface-container-lowest text-on-surface focus:border-primary-container disabled:opacity-50"
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
      {error && <p className="text-caption text-error">{error}</p>}
    </div>
  );
}
