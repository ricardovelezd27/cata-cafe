"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil, Check, X, Send } from "lucide-react";
import { removeMember, updateMemberDisplayName, resendInvitation } from "@/app/actions/groups";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useActionFeedback } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { HIT_Y44 } from "@/components/ui/hitArea";
import { cardClasses } from "@/components/ui/cardRecipe";

type Member = {
  id: string;
  email: string;
  displayName: string | null;
  userId: string | null;
  /** The member unsubscribed from this group's emails (S8-20). */
  emailOptedOut?: boolean;
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
    emailOptedOut: string;
    removeMember: string;
    /** ConfirmDialog title. */
    removeTitle: string;
    /** Raw template with {name}: "¿Quitar a {name} del grupo?". */
    removeBodyNamed: string;
    cancel: string;
    errorGeneric: string;
    editName: string;
    namePlaceholder: string;
    save: string;
    resend: string;
    resent: string;
    resendFailed: string;
    resendRateLimited: string;
    /** N2: raw templates with {name}, so each icon button says whom it acts on. */
    removeNamed: string;
    editNameNamed: string;
    resendNamed: string;
    saveNamed: string;
    cancelNamed: string;
    /** Label of the rename field (screen readers only: the field takes the name's place in the row). */
    nameLabelNamed: string;
  };
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedback = useActionFeedback();
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [resendStatus, setResendStatus] = useState<
    Record<string, "sent" | "skipped" | "failed" | "rate_limited">
  >({});
  const [, start] = useTransition();
  const uid = useId();
  /** The member as the roster shows them (the owner's own view: name, else the address it already displays). */
  const named = (template: string, m: Member) => template.replace("{name}", m.displayName || m.email);

  // Runs inside ConfirmDialog. A failure is toasted with its own localized
  // copy (feedback.run) and the dialog closes; success refreshes the roster.
  const confirmRemove = async () => {
    if (!removeTarget) return;
    await feedback.run(removeMember(groupId, removeTarget.id), () => router.refresh());
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
        await feedback.run(updateMemberDisplayName(groupId, memberId, trimmed), () => {
          setEditingId(null);
          router.refresh();
        });
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
        setResendStatus((prev) => ({
          ...prev,
          [memberId]: result.ok ? result.data.emailStatus : "failed",
        }));
        if (!result.ok) feedback.notifyError(result.error);
      } catch {
        setResendStatus((prev) => ({ ...prev, [memberId]: "failed" }));
        feedback.notifyError(
          typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "unknown",
        );
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
            className={`${cardClasses({ padding: "row" })} flex items-center justify-between gap-3`}
          >
            {isEditing ? (
              <div className="flex flex-1 items-center gap-2 min-w-0">
                <label htmlFor={`${uid}-name-${m.id}`} className="sr-only">
                  {named(t.nameLabelNamed, m)}
                </label>
                <input
                  id={`${uid}-name-${m.id}`}
                  autoFocus
                  className="min-h-[44px] min-w-0 flex-1 rounded-input border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 text-caption text-on-surface transition-colors focus:border-primary-container"
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
                  aria-label={named(t.saveNamed, m)}
                  className={`${HIT_Y44} p-1.5 text-primary-container transition-colors hover:text-primary disabled:opacity-50`}
                >
                  <Check size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={pendingId === m.id}
                  title={t.cancel}
                  aria-label={named(t.cancelNamed, m)}
                  className={`${HIT_Y44} p-1.5 text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50`}
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="text-body font-semibold text-on-surface truncate">
                  {m.displayName || m.email}
                </p>
                {m.displayName && <p className="text-caption text-on-surface-variant truncate">{m.email}</p>}
                {status === "sent" && <p className="text-caption text-primary-container">{t.resent}</p>}
                {status === "failed" && <p className="text-caption text-error">{t.resendFailed}</p>}
                {status === "rate_limited" && (
                  <p className="text-caption text-secondary" role="status">
                    {t.resendRateLimited}
                  </p>
                )}
              </div>
            )}
            {!isEditing && (
              <div className="flex items-center gap-2 shrink-0">
                {m.emailOptedOut && (
                  <Badge tone="neutral" size="xs">
                    {t.emailOptedOut}
                  </Badge>
                )}
                {!m.userId && (
                  <span className="label-caps px-2 py-0.5 rounded-full bg-secondary/15 text-secondary">
                    {t.unregistered}
                  </span>
                )}
                {!m.userId && (
                  <button
                    type="button"
                    onClick={() => onResend(m.id)}
                    disabled={pendingId === m.id}
                    title={t.resend}
                    aria-label={named(t.resendNamed, m)}
                    className={`${HIT_Y44} p-1.5 text-on-surface-variant transition-colors hover:text-primary-container disabled:opacity-50`}
                  >
                    <Send size={16} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  disabled={pendingId === m.id}
                  title={t.editName}
                  aria-label={named(t.editNameNamed, m)}
                  className={`${HIT_Y44} p-1.5 text-on-surface-variant hover:text-primary-container transition-colors disabled:opacity-50`}
                >
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setRemoveTarget(m)}
                  disabled={pendingId === m.id}
                  title={t.removeMember}
                  aria-label={named(t.removeNamed, m)}
                  className={`${HIT_Y44} p-1.5 text-on-surface-variant hover:text-error transition-colors disabled:opacity-50`}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="text-caption text-error">{error}</p>}
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={t.removeTitle}
        body={t.removeBodyNamed.replace(
          "{name}",
          removeTarget?.displayName || removeTarget?.email || "",
        )}
        confirmLabel={t.removeMember}
        cancelLabel={t.cancel}
        closeLabel={t.cancel}
        onConfirm={confirmRemove}
        error={t.errorGeneric}
      />
    </div>
  );
}
