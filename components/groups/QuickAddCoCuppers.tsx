"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { addMemberByUserId } from "@/app/actions/groups";
import { useActionFeedback } from "@/components/ui/Toast";
import { HIT_44 } from "@/components/ui/hitArea";
import { cardClasses } from "@/components/ui/cardRecipe";

type Candidate = { userId: string; displayName: string };

export function QuickAddCoCuppers({
  groupId,
  candidates,
  t,
}: {
  groupId: string;
  candidates: Candidate[];
  t: {
    noCoCuppers: string;
    added: string;
    errorGeneric: string;
    /** N2: raw template with {name}: "Añadir a {name} al grupo". */
    addNamed: string;
  };
}) {
  const router = useRouter();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const feedback = useActionFeedback();
  const [, start] = useTransition();

  const onAdd = (userId: string) => {
    setPendingId(userId);
    start(async () => {
      try {
        await feedback.run(addMemberByUserId(groupId, userId), () => {
          setAddedIds((prev) => new Set(prev).add(userId));
          router.refresh();
        });
      } finally {
        setPendingId(null);
      }
    });
  };

  if (candidates.length === 0) {
    return <p className="text-caption text-on-surface-variant">{t.noCoCuppers}</p>;
  }

  return (
    <div className="space-y-2">
      {candidates.map((c) => {
        const added = addedIds.has(c.userId);
        return (
          <div
            key={c.userId}
            className={`${cardClasses({ padding: "row" })} flex items-center justify-between gap-3`}
          >
            <p className="text-body text-on-surface truncate">{c.displayName}</p>
            {added ? (
              <span className="inline-flex items-center gap-1 text-caption font-medium text-primary-container shrink-0">
                <Check size={14} /> {t.added}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onAdd(c.userId)}
                disabled={pendingId === c.userId}
                aria-label={t.addNamed.replace("{name}", c.displayName)}
                className={`${HIT_44} p-1.5 text-on-surface-variant hover:text-primary-container transition-colors disabled:opacity-50 shrink-0`}
              >
                <Plus size={16} aria-hidden />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
