"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMemberByEmail } from "@/app/actions/groups";

export function AddByEmailForm({
  groupId,
  t,
}: {
  groupId: string;
  t: {
    emailPlaceholder: string;
    displayNamePlaceholder: string;
    addMember: string;
    errorGeneric: string;
  };
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const inputCls =
    "w-full px-3 py-2 border border-[#D4C5A9] rounded-input text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    start(async () => {
      try {
        await addMemberByEmail(groupId, trimmed, displayName.trim() || undefined);
        setEmail("");
        setDisplayName("");
        router.refresh();
      } catch {
        setError(t.errorGeneric);
      }
    });
  };

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
    </form>
  );
}
