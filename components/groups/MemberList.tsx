"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { removeMember } from "@/app/actions/groups";

type Member = {
  id: string;
  email: string;
  displayName: string | null;
  userId: string | null;
};

export function MemberList({
  groupId,
  members,
  t,
}: {
  groupId: string;
  members: Member[];
  t: {
    unregistered: string;
    removeMember: string;
    confirmRemoveMember: string;
    errorGeneric: string;
  };
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const onRemove = (memberId: string) => {
    if (!window.confirm(t.confirmRemoveMember)) return;
    setError(null);
    setPendingId(memberId);
    start(async () => {
      try {
        await removeMember(groupId, memberId);
        router.refresh();
      } catch {
        setError(t.errorGeneric);
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <div className="space-y-2">
      {members.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-[#E8E0D0] rounded-lg"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brown-dark truncate">
              {m.displayName || m.email}
            </p>
            {m.displayName && <p className="text-xs text-brown-mid truncate">{m.email}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!m.userId && (
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-amber-warm/15 text-amber-warm">
                {t.unregistered}
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(m.id)}
              disabled={pendingId === m.id}
              title={t.removeMember}
              className="p-1.5 text-brown-mid hover:text-red-defect transition-colors disabled:opacity-50"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-red-defect">{error}</p>}
    </div>
  );
}
