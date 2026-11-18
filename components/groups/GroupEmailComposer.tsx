"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Mail, Check, Clock, X, RotateCcw, type LucideIcon } from "lucide-react";
import { sendGroupEmail, type GroupEmailSummary } from "@/app/actions/groups";
import { cardClasses } from "@/components/ui/cardRecipe";
import { Button } from "@/components/ui/Button";

type SessionOption = { id: string; name: string; status: string };

// next-intl gotcha (see project memory): "sendSummary" contains {sent}/{skipped}/{failed}
// ICU placeholders, so the server passes the RAW template (via t.raw()) and this tiny
// helper interpolates it locally — calling t("sendSummary") without args would render
// the raw key instead of the message.
function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

// Per-recipient status is conveyed by icon + color rather than translated text — no
// translation keys were defined for the individual "sent"/"skipped"/"failed" words
// (only the aggregate "sendSummary" sentence has them), so this avoids leaking raw
// English into the Spanish UI while still matching the spec's sent/amber/red coding.
const STATUS_STYLE: Record<
  GroupEmailSummary["results"][number]["status"],
  { icon: LucideIcon; className: string }
> = {
  sent: { icon: Check, className: "bg-primary-fixed text-primary-container" },
  skipped: { icon: Clock, className: "bg-secondary/15 text-secondary" },
  failed: { icon: X, className: "bg-error-container text-error" },
};

export function GroupEmailComposer({
  groupId,
  sessions,
  t,
}: {
  groupId: string;
  sessions: SessionOption[];
  t: {
    subject: string;
    message: string;
    includeInviteLink: string;
    selectSession: string;
    send: string;
    sending: string;
    sendSummaryTemplate: string;
    sendSkippedNotice: string;
    errorGeneric: string;
    rateLimited: string;
    retryFailed: string;
    retrying: string;
  };
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeInvite, setIncludeInvite] = useState(false);
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [summary, setSummary] = useState<GroupEmailSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [pending, start] = useTransition();
  // One id per message: re-sending it ("Reintentar fallidos") reaches only the
  // recipients that did not get it. Any edit makes it a different message.
  const broadcastRef = useRef<string | null>(null);
  const edited = () => {
    broadcastRef.current = null;
    setRetryable(false);
  };

  const inputCls =
    "w-full px-3 py-2 border border-outline-variant rounded-input text-caption bg-surface-container-lowest text-on-surface focus:border-primary-container";
  // The label style of the group forms (GroupNameControls, CreateGroupDialog).
  const labelCls = "label-caps block";
  const uid = useId();

  const submit = () => {
    if (!subject.trim() || !message.trim()) return;
    setError(null);
    broadcastRef.current ??= crypto.randomUUID();
    start(async () => {
      try {
        const result = await sendGroupEmail({
          groupId,
          subject: subject.trim(),
          message: message.trim(),
          sessionId: includeInvite && sessionId ? sessionId : undefined,
          broadcastId: broadcastRef.current ?? undefined,
        });
        if (result.ok) {
          setSummary(result.data);
          setRetryable(result.data.failed > 0);
          if (result.data.failed === 0) broadcastRef.current = null;
        } else if (result.error === "rate_limited") {
          setError(t.rateLimited);
        } else {
          setError(t.errorGeneric);
        }
      } catch {
        setError(t.errorGeneric);
      }
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const allSkipped =
    summary !== null && summary.results.length > 0 && summary.results.every((r) => r.status === "skipped");

  return (
    <form onSubmit={onSubmit} className={`${cardClasses()} space-y-4`}>
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-subject`} className={labelCls}>
          {t.subject}
        </label>
        <input
          id={`${uid}-subject`}
          className={inputCls + " min-h-[44px]"}
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            edited();
          }}
          placeholder={t.subject}
          maxLength={200}
          required
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-message`} className={labelCls}>
          {t.message}
        </label>
        <textarea
          id={`${uid}-message`}
          className={inputCls + " min-h-[120px]"}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            edited();
          }}
          placeholder={t.message}
          maxLength={5000}
          required
        />
      </div>

      {sessions.length > 0 && (
        <div className="space-y-2">
          <label className="flex min-h-[44px] items-center gap-2 text-body text-on-surface">
            <input
              type="checkbox"
              checked={includeInvite}
              onChange={(e) => {
                setIncludeInvite(e.target.checked);
                edited();
              }}
              className="rounded border-outline-variant"
            />
            {t.includeInviteLink}
          </label>
          {includeInvite && (
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-session`} className={labelCls}>
                {t.selectSession}
              </label>
              <select
                id={`${uid}-session`}
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value);
                  edited();
                }}
                className={inputCls + " min-h-[44px]"}
                title={t.selectSession}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <Button className="self-start"
        type="submit"
        disabled={pending || !subject.trim() || !message.trim()}
      >
        <Mail size={16} aria-hidden />
        {pending ? t.sending : t.send}
      </Button>

      {error && (
        <p className="text-caption text-error" role="alert">
          {error}
        </p>
      )}

      {summary && (
        <div className="space-y-3 pt-3 border-t border-outline-variant">
          <p className="text-caption font-semibold text-on-surface">
            {formatTemplate(t.sendSummaryTemplate, {
              sent: summary.sent,
              skipped: summary.skipped,
              failed: summary.failed,
            })}
          </p>
          {allSkipped && <p className="text-caption text-on-surface-variant">{t.sendSkippedNotice}</p>}
          {retryable && summary.failed > 0 && (
            <Button variant="secondary" size="sm"
              type="button"
              onClick={submit}
              disabled={pending}
            >
              <RotateCcw size={14} />
              {pending ? t.retrying : t.retryFailed}
            </Button>
          )}
          <div className="space-y-1">
            {summary.results.map((r) => {
              const style = STATUS_STYLE[r.status];
              const Icon = style.icon;
              return (
                <div
                  key={r.memberId}
                  className="flex items-center justify-between gap-3 border-b border-outline-variant py-1.5 text-caption last:border-b-0"
                >
                  <span className="text-on-surface truncate">{r.label}</span>
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${style.className}`}
                    title={r.status}
                  >
                    <Icon size={12} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </form>
  );
}
