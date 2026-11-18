"use client";

// Owner-only announcement composer. Publishes via createGroupPost, which
// (best-effort) reuses the group email-blast machinery when notifyByEmail is
// on — a failed or throttled send never blocks the post itself. The email is
// opt-in (unticked by default, S8-03 F-grupos-2) and the checkbox says how many
// people it will reach; after publishing, the outcome is shown inline.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createGroupPost } from "@/app/actions/groups";
import { useActionFeedback } from "@/components/ui/Toast";
import { cardClasses } from "@/components/ui/cardRecipe";
import { PaperSectionHeading } from "@/components/ui/PaperSectionHeading";
import { Button } from "@/components/ui/Button";

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
  /** N2: visible labels of the two fields (the placeholders stay as hints). */
  titleLabel: string;
  bodyLabel: string;
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

  const uid = useId();
  // The label style of the group forms (GroupNameControls, CreateGroupDialog).
  const labelCls = "label-caps block";
  const inputCls =
    "w-full border border-outline-variant rounded-input px-3.5 py-2.5 text-body text-on-surface bg-surface-container-lowest focus:border-primary-container transition-colors";

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
      className={`${cardClasses()} space-y-4`}
    >
      <PaperSectionHeading level={3} title={t.composerTitle} flush />
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-title`} className={labelCls}>
          {t.titleLabel}
        </label>
        <input
          id={`${uid}-title`}
          className={inputCls + " min-h-[44px]"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.titlePlaceholder}
          maxLength={120}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-body`} className={labelCls}>
          {t.bodyLabel}
        </label>
        <textarea
          id={`${uid}-body`}
          className={inputCls + " min-h-[100px]"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.bodyPlaceholder}
          maxLength={5000}
          required
        />
      </div>
      <label className="flex min-h-[44px] items-center gap-2.5 text-body text-on-surface cursor-pointer">
        <input
          type="checkbox"
          checked={notifyByEmail}
          onChange={(e) => setNotifyByEmail(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded accent-primary-container cursor-pointer"
        />
        <span>
          {t.notifyByEmail}
          <span className="block text-caption text-on-surface-variant">
            {recipientCount > 0
              ? formatTemplate(t.notifyRecipientsTemplate, { count: recipientCount })
              : t.notifyNone}
          </span>
        </span>
      </label>

      {notice && (
        <p
          role="status"
          className={`text-caption ${notice.tone === "warn" ? "text-secondary" : "text-on-surface-variant"}`}
        >
          {notice.text}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || !body.trim()}
      >
        <Send size={16} aria-hidden />
        {pending ? t.publishing : t.publish}
      </Button>
    </form>
  );
}
