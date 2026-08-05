"use client";

// Owner-only announcement composer. Publishes via createGroupPost, which
// (best-effort) reuses the group email-blast machinery when notifyByEmail is
// on — a failed send never blocks the post itself, so this component only
// ever needs to handle the { ok: false } validation branch.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createGroupPost } from "@/app/actions/groups";

export type PostComposerTranslations = {
  composerTitle: string;
  titlePlaceholder: string;
  bodyPlaceholder: string;
  notifyByEmail: string;
  publish: string;
  publishing: string;
  error: string;
};

export function PostComposer({ groupId, t }: { groupId: string; t: PostComposerTranslations }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const inputCls =
    "w-full border border-outline-variant rounded-input px-3.5 py-2.5 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    setError(null);
    start(async () => {
      try {
        const result = await createGroupPost({
          groupId,
          title: title.trim() || undefined,
          body: trimmedBody,
          notifyByEmail,
        });
        if (!result.ok) {
          setError(t.error);
          return;
        }
        setTitle("");
        setBody("");
        router.refresh();
      } catch {
        setError(t.error);
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface-container-lowest border border-outline-variant rounded-card p-5 space-y-4"
    >
      <h3 className="font-display text-xl text-on-surface">{t.composerTitle}</h3>
      <input
        className={inputCls}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t.titlePlaceholder}
        maxLength={120}
      />
      <textarea
        className={inputCls + " min-h-[100px]"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t.bodyPlaceholder}
        maxLength={5000}
        required
      />
      <label className="flex items-center gap-2.5 text-sm text-on-surface cursor-pointer">
        <input
          type="checkbox"
          checked={notifyByEmail}
          onChange={(e) => setNotifyByEmail(e.target.checked)}
          className="h-4 w-4 rounded accent-primary-container cursor-pointer"
        />
        {t.notifyByEmail}
      </label>

      {error && <p className="text-xs text-error">{error}</p>}

      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="inline-flex items-center gap-2 rounded-pill bg-primary-container px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-primary transition-colors disabled:opacity-50"
      >
        <Send size={16} />
        {pending ? t.publishing : t.publish}
      </button>
    </form>
  );
}
