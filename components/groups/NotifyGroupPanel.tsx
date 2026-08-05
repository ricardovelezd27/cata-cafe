"use client";

// Optional "notify a group" panel shown on step 2 of the new-session wizard
// (after createGroupSession has already minted the invite token). Fully
// skippable — the copy-link flow above it stays the primary path. Renders
// nothing when the maestro has no saved tasting groups yet, so there's no
// empty-state clutter on top of the invite-link box.
//
// sendGroupEmail resolves the session's invite link server-side from
// sessionId (reusing the newest valid SessionInvite), so we only need to
// pass groupId/subject/message/sessionId — never the raw token.

import { useState, useTransition } from "react";
import { sendGroupEmail, type GroupEmailSummary } from "@/app/actions/groups";

export type NotifyGroupOption = { id: string; name: string; memberCount: number };

export type NotifyGroupTranslations = {
  notifyGroupTitle: string;
  selectGroup: string;
  noGroupsYet: string;
  subject: string;
  message: string;
  send: string;
  sending: string;
  // Raw ICU template (see next-intl placeholder gotcha in project memory) —
  // interpolated locally with formatTemplate below rather than via t().
  sendSummary: string;
  sendSkippedNotice: string;
  skip: string;
  inviteDefaultMessage: string;
};

// Same tiny interpolation helper as components/groups/GroupEmailComposer.tsx.
function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export function NotifyGroupPanel({
  groups,
  sessionId,
  defaultSubject,
  t,
}: {
  groups: NotifyGroupOption[];
  sessionId: string;
  defaultSubject: string;
  t: NotifyGroupTranslations;
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(t.inviteDefaultMessage);
  const [summary, setSummary] = useState<GroupEmailSummary | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pending, start] = useTransition();

  if (groups.length === 0 || dismissed) return null;

  const inputCls =
    "w-full px-3 py-2 border border-outline-variant rounded-input text-sm bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary-container";

  const allSkipped =
    summary !== null &&
    summary.results.length > 0 &&
    summary.results.every((r) => r.status === "skipped");

  const onSend = () => {
    if (!groupId || !subject.trim() || !message.trim()) return;
    start(async () => {
      const result = await sendGroupEmail({
        groupId,
        subject: subject.trim(),
        message: message.trim(),
        sessionId,
      });
      setSummary(result);
    });
  };

  return (
    <div className="p-4 bg-surface-container-lowest border border-outline-variant rounded-card space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-primary-container">{t.notifyGroupTitle}</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-on-surface-variant hover:text-on-surface"
        >
          {t.skip}
        </button>
      </div>

      <select
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        className={inputCls}
        title={t.selectGroup}
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} ({g.memberCount})
          </option>
        ))}
      </select>

      <input
        className={inputCls}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={t.subject}
        maxLength={200}
      />

      <textarea
        className={inputCls + " min-h-[80px]"}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t.message}
        maxLength={5000}
      />

      <button
        type="button"
        onClick={onSend}
        disabled={pending || !groupId || !subject.trim() || !message.trim()}
        className="px-4 py-2 rounded-pill bg-primary-container text-white text-sm font-semibold disabled:opacity-50"
      >
        {pending ? t.sending : t.send}
      </button>

      {summary && (
        <div className="pt-2 border-t border-outline-variant space-y-1">
          <p className="text-xs font-semibold text-on-surface">
            {formatTemplate(t.sendSummary, {
              sent: summary.sent,
              skipped: summary.skipped,
              failed: summary.failed,
            })}
          </p>
          {allSkipped && <p className="text-xs text-on-surface-variant">{t.sendSkippedNotice}</p>}
        </div>
      )}
    </div>
  );
}
