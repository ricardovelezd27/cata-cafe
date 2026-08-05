"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, Check, X, Send } from "lucide-react";
import { removeMember, updateMemberDisplayName, resendInvitation } from "@/app/actions/groups";

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
    editName: string;
    namePlaceholder: string;
    save: string;
    resend: string;
    resent: string;
    resendFailed: string;
  };
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [resendStatus, setResendStatus] = useState<Record<string, "sent" | "skipped" | "failed">>({});
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

  const startEdit = (member: Member) => {
    setError(null);
    setEditingId(member.id);
    setEditValue(member.displayName ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const saveEdit = (memberId: string) => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setError(null);
    setPendingId(memberId);
    start(async () => {
      try {
        await updateMemberDisplayName(groupId, memberId, trimmed);
        setEditingId(null);
        router.refresh();
      } catch {
        setError(t.errorGeneric);
      } finally {
        setPendingId(null);
      }
    });
  };

  const onResend = (memberId: string) => {
    setError(null);
    setPendingId(memberId);
    start(async () => {
      try {
        const result = await resendInvitation(groupId, memberId);
        setResendStatus((prev) => ({ ...prev, [memberId]: result.emailStatus }));
      } catch {
        setResendStatus((prev) => ({ ...prev, [memberId]: "failed" }));
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <div className="space-y-2">
      {members.map((m) => {
        const isEditing = editingId === m.id;
        const status = resendStatus[m.id];
        return (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-card"
          >
            {isEditing ? (
              <div className="flex flex-1 items-center gap-2 min-w-0">
                <input
                  autoFocus
                  className="min-w-0 flex-1 rounded-input border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface transition-colors focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/25"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder={t.namePlaceholder}
                  maxLength={80}
                />
                <button
                  type="button"
                  onClick={() => saveEdit(m.id)}
                  disabled={pendingId === m.id || !editValue.trim()}
                  title={t.save}
                  className="p-1.5 text-primary-container transition-colors hover:text-primary disabled:opacity-50"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={pendingId === m.id}
                  className="p-1.5 text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">
                  {m.displayName || m.email}
                </p>
                {m.displayName && <p className="text-xs text-on-surface-variant truncate">{m.email}</p>}
                {status === "sent" && <p className="text-xs text-primary-container">{t.resent}</p>}
                {status === "failed" && <p className="text-xs text-error">{t.resendFailed}</p>}
              </div>
            )}
            {!isEditing && (
              <div className="flex items-center gap-2 shrink-0">
                {!m.userId && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded-full bg-secondary/15 text-secondary">
                    {t.unregistered}
                  </span>
                )}
                {!m.userId && (
                  <button
                    type="button"
                    onClick={() => onResend(m.id)}
                    disabled={pendingId === m.id}
                    title={t.resend}
                    className="p-1.5 text-on-surface-variant transition-colors hover:text-primary-container disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  disabled={pendingId === m.id}
                  title={t.editName}
                  className="p-1.5 text-on-surface-variant hover:text-primary-container transition-colors disabled:opacity-50"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(m.id)}
                  disabled={pendingId === m.id}
                  title={t.removeMember}
                  className="p-1.5 text-on-surface-variant hover:text-error transition-colors disabled:opacity-50"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
