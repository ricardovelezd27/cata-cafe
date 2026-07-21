"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createGroup } from "@/app/actions/groups";

export function CreateGroupForm({
  t,
}: {
  t: { newGroup: string; namePlaceholder: string; create: string; errorGeneric: string };
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    start(async () => {
      try {
        await createGroup({ name: trimmed });
        setName("");
        router.refresh();
      } catch {
        setError(t.errorGeneric);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label className="block text-xs text-brown-mid font-semibold uppercase tracking-wide">
        {t.newGroup}
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="flex-1 px-3 py-2 border border-[#D4C5A9] rounded-lg text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.namePlaceholder}
          maxLength={80}
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-green-dark text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
        >
          <Plus size={16} />
          {t.create}
        </button>
      </div>
      {error && <p className="text-xs text-red-defect">{error}</p>}
    </form>
  );
}
