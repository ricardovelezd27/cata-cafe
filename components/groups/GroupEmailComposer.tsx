"use client";

import { useState, useTransition } from "react";
import { Mail, Check, Clock, X, type LucideIcon } from "lucide-react";
import { sendGroupEmail, type GroupEmailSummary } from "@/app/actions/groups";

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
  };
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeInvite, setIncludeInvite] = useState(false);
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [summary, setSummary] = useState<GroupEmailSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const inputCls =
    "w-full px-3 py-2 border border-outline-variant rounded-input text-sm bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary-container";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setError(null);
    start(async () => {
      try {
        const result = await sendGroupEmail({
          groupId,
          subject: subject.trim(),
          message: message.trim(),
          sessionId: includeInvite && sessionId ? sessionId : undefined,
        });
        setSummary(result);
      } catch {
        setError(t.errorGeneric);
      }
    });
  };

  const allSkipped =
    summary !== null && summary.results.length > 0 && summary.results.every((r) => r.status === "skipped");

  return (
    <form onSubmit={onSubmit} className="space-y-4 bg-surface-container-lowest border border-outline-variant rounded-card p-5">
      <input
        className={inputCls}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={t.subject}
        maxLength={200}
        required
      />
      <textarea
        className={inputCls + " min-h-[120px]"}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t.message}
        maxLength={5000}
        required
      />

      {sessions.length > 0 && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={includeInvite}
              onChange={(e) => setIncludeInvite(e.target.checked)}
              className="rounded border-outline-variant"
            />
            {t.includeInviteLink}
          </label>
          {includeInvite && (
            <select
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className={inputCls}
              title={t.selectSession}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !subject.trim() || !message.trim()}
        className="inline-flex items-center gap-2 px-5 py-2 rounded-pill bg-primary-container text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        <Mail size={16} />
        {pending ? t.sending : t.send}
      </button>

      {error && <p className="text-xs text-error">{error}</p>}

      {summary && (
        <div className="space-y-3 pt-3 border-t border-outline-variant">
          <p className="text-sm font-semibold text-on-surface">
            {formatTemplate(t.sendSummaryTemplate, {
              sent: summary.sent,
              skipped: summary.skipped,
              failed: summary.failed,
            })}
          </p>
          {allSkipped && <p className="text-xs text-on-surface-variant">{t.sendSkippedNotice}</p>}
          <div className="space-y-1">
            {summary.results.map((r, i) => {
              const style = STATUS_STYLE[r.status];
              const Icon = style.icon;
              return (
                <div
                  key={`${r.email}-${i}`}
                  className="flex items-center justify-between gap-3 text-xs px-3 py-1.5 bg-surface border border-outline-variant rounded-card"
                >
                  <span className="text-on-surface truncate">{r.email}</span>
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
