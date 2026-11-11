"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, X, type LucideIcon } from "lucide-react";
import { addMemberByEmail } from "@/app/actions/groups";
import { useActionFeedback } from "@/components/ui/Toast";

type EmailStatus = "sent" | "skipped" | "failed" | "rate_limited";

// Icon + color coding, same convention as GroupEmailComposer's per-recipient
// status rows — "sent", "skipped" and "rate_limited" have accompanying copy
// (there's no dedicated translation key for "failed"; the amber icon alone
// conveys it).
const STATUS_STYLE: Record<EmailStatus, { icon: LucideIcon; className: string }> = {
  sent: { icon: Check, className: "text-primary-container" },
  skipped: { icon: Clock, className: "text-secondary" },
  failed: { icon: X, className: "text-secondary" },
  rate_limited: { icon: Clock, className: "text-secondary" },
};

export function AddByEmailForm({
  groupId,
  t,
}: {
  groupId: string;
  t: {
    emailPlaceholder: string;
    displayNamePlaceholder: string;
    addMember: string;
    added: string;
    sendSkippedNotice: string;
    inviteRateLimited: string;
    errorGeneric: string;
  };
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const feedback = useActionFeedback();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [pending, start] = useTransition();

  const inputCls =
    "w-full px-3 py-2 border border-outline-variant rounded-input text-sm bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary-container";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus(null);
    start(async () => {
      await feedback.run(
        addMemberByEmail(groupId, trimmed, displayName.trim() || undefined),
        (data) => {
          setEmail("");
          setDisplayName("");
          setStatus(data.emailStatus ?? null);
          router.refresh();
        },
      );
    });
  };

  const StatusIcon = status ? STATUS_STYLE[status].icon : null;

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input
        type="email"
        className={inputCls}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t.emailPlaceholder}
        required
      />
      <input
        className={inputCls}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder={t.displayNamePlaceholder}
        maxLength={80}
      />
      <button
        type="submit"
        disabled={pending || !email.trim()}
        className="px-4 py-2 rounded-pill bg-primary-container text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {t.addMember}
      </button>
      {status && StatusIcon && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${STATUS_STYLE[status].className}`}>
          <StatusIcon size={14} />
          {status === "sent" && t.added}
          {status === "skipped" && t.sendSkippedNotice}
          {status === "rate_limited" && t.inviteRateLimited}
        </div>
      )}
    </form>
  );
}
