"use client";

// Owner-only announcement composer. Publishes via createGroupPost, which
// (best-effort) reuses the group email-blast machinery when notifyByEmail is
// on — a failed or throttled send never blocks the post itself. The email is
// opt-in (unticked by default, S8-03 F-grupos-2) and the checkbox says how many
// people it will reach; after publishing, the outcome is shown inline.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createGroupPost } from "@/app/actions/groups";
import { useActionFeedback } from "@/components/ui/Toast";

export type PostComposerTranslations = {
  composerTitle: string;
  titlePlaceholder: string;
  bodyPlaceholder: string;
  notifyByEmail: string;
  publish: string;
  publishing: string;
  error: string;
  /** Raw template with {count}: "Se enviará un correo a {count} integrantes". */
  notifyRecipientsTemplate: string;
  notifyNone: string;
  /** Raw template with {sent}/{skipped}/{failed}. */
  sendSummaryTemplate: string;
  sendRateLimited: string;
};

// next-intl gotcha: a {placeholder} message must be interpolated locally from
// the RAW template (t.raw) — calling t() without the arg renders the raw key.
function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export function PostComposer({
  groupId,
  recipientCount,
  t,
}: {
  groupId: string;
  recipientCount: number;
  t: PostComposerTranslations;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const feedback = useActionFeedback();
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [pending, start] = useTransition();

  const inputCls =
    "w-full border border-outline-variant rounded-input px-3.5 py-2.5 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    setNotice(null);
    start(async () => {
      await feedback.run(
        createGroupPost({
          groupId,
          title: title.trim() || undefined,
          body: trimmedBody,
          notifyByEmail,
        }),
        (data) => {
          setTitle("");
          setBody("");
          if (data.emailBlocked === "rate_limited") {
            setNotice({ text: t.sendRateLimited, tone: "warn" });
          } else if (data.emailSummary) {
            setNotice({
              text: formatTemplate(t.sendSummaryTemplate, {
                sent: data.emailSummary.sent,
                skipped: data.emailSummary.skipped,
                failed: data.emailSummary.failed,
              }),
              tone: data.emailSummary.failed > 0 ? "warn" : "ok",
            });
          }
          router.refresh();
        },
      );
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
      <label className="flex items-start gap-2.5 text-sm text-on-surface cursor-pointer">
        <input
          type="checkbox"
          checked={notifyByEmail}
          onChange={(e) => setNotifyByEmail(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded accent-primary-container cursor-pointer"
        />
        <span>
          {t.notifyByEmail}
          <span className="block text-xs text-on-surface-variant">
            {recipientCount > 0
              ? formatTemplate(t.notifyRecipientsTemplate, { count: recipientCount })
              : t.notifyNone}
          </span>
        </span>
      </label>

      {notice && (
        <p
          role="status"
          className={`text-xs ${notice.tone === "warn" ? "text-secondary" : "text-on-surface-variant"}`}
        >
          {notice.text}
        </p>
      )}

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
