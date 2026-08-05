"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { addMemberByUserId } from "@/app/actions/groups";

type Candidate = { userId: string; displayName: string };

export function QuickAddCoCuppers({
  groupId,
  candidates,
  t,
}: {
  groupId: string;
  candidates: Candidate[];
  t: { noCoCuppers: string; added: string; errorGeneric: string };
}) {
  const router = useRouter();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const onAdd = (userId: string) => {
    setError(null);
    setPendingId(userId);
    start(async () => {
      try {
        await addMemberByUserId(groupId, userId);
        setAddedIds((prev) => new Set(prev).add(userId));
        router.refresh();
      } catch {
        setError(t.errorGeneric);
      } finally {
        setPendingId(null);
      }
    });
  };

  if (candidates.length === 0) {
    return <p className="text-sm text-on-surface-variant">{t.noCoCuppers}</p>;
  }

  return (
    <div className="space-y-2">
      {candidates.map((c) => {
        const added = addedIds.has(c.userId);
        return (
          <div
            key={c.userId}
            className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded-card"
          >
            <p className="text-sm text-on-surface truncate">{c.displayName}</p>
            {added ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-container shrink-0">
                <Check size={14} /> {t.added}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onAdd(c.userId)}
                disabled={pendingId === c.userId}
                className="p-1.5 text-on-surface-variant hover:text-primary-container transition-colors disabled:opacity-50 shrink-0"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
