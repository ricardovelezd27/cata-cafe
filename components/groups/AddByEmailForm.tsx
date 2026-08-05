"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, X, type LucideIcon } from "lucide-react";
import { addMemberByEmail } from "@/app/actions/groups";

type EmailStatus = "sent" | "skipped" | "failed";

// Icon + color coding, same convention as GroupEmailComposer's per-recipient
// status rows — only "sent" and "skipped" have accompanying copy (there's no
// dedicated translation key for "failed"; the amber icon alone conveys it).
const STATUS_STYLE: Record<EmailStatus, { icon: LucideIcon; className: string }> = {
  sent: { icon: Check, className: "text-green-dark" },
  skipped: { icon: Clock, className: "text-amber-warm" },
  failed: { icon: X, className: "text-amber-warm" },
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
    errorGeneric: string;
  };
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [pending, start] = useTransition();

  const inputCls =
    "w-full px-3 py-2 border border-[#D4C5A9] rounded-input text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    setStatus(null);
    start(async () => {
      try {
        const result = await addMemberByEmail(groupId, trimmed, displayName.trim() || undefined);
        setEmail("");
        setDisplayName("");
        setStatus(result.emailStatus ?? null);
        router.refresh();
      } catch {
        setError(t.errorGeneric);
      }
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
        className="px-4 py-2 rounded-pill bg-green-dark text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {t.addMember}
      </button>
      {error && <p className="text-xs text-red-defect">{error}</p>}
      {status && StatusIcon && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${STATUS_STYLE[status].className}`}>
          <StatusIcon size={14} />
          {status === "sent" && t.added}
          {status === "skipped" && t.sendSkippedNotice}
        </div>
      )}
    </form>
  );
}
