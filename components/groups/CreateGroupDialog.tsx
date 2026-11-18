"use client";

// Single-screen "create a tasting group" flow: name + description + an
// optional roster of email invitees, plus one-tap chips for co-cuppers the
// maestro has already cupped with. Fully replaces the old bare
// CreateGroupForm — group creation and the initial invite blast now happen
// in one atomic call to createGroupWithMembers.

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check } from "lucide-react";
import { createGroupWithMembers } from "@/app/actions/groups";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { HIT_44 } from "@/components/ui/hitArea";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateGroupCandidate = { userId: string; displayName: string };

export type CreateGroupTranslations = {
  createGroupCta: string;
  createGroupTitle: string;
  namePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  membersSectionTitle: string;
  emailPlaceholder: string;
  displayNamePlaceholder: string;
  addAnotherMember: string;
  removeRow: string;
  quickAddTitle: string;
  createAndInvite: string;
  creating: string;
  // Raw ICU template ({sent}/{failed}) — see next-intl placeholder gotcha in
  // project memory: interpolated locally with formatTemplate, never via t().
  invitesSentSummaryTemplate: string;
  invitesRateLimited: string;
  errorGeneric: string;
  closeLabel: string;
  /** N2: visible labels: the name field (groupName) and each row's address field (emailLabel); a row's name field uses displayNamePlaceholder. */
  groupName: string;
  emailLabel: string;
  /** N2: raw template with {n}: "Quitar la fila {n}". */
  removeRowNamed: string;
};

type MemberRow = { email: string; displayName: string };

// Same tiny interpolation helper as GroupEmailComposer.tsx / NotifyGroupPanel.tsx.
function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export function CreateGroupDialog({
  locale,
  candidates,
  t,
}: {
  locale: string;
  candidates: CreateGroupCandidate[];
  t: CreateGroupTranslations;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<MemberRow[]>([{ email: "", displayName: "" }]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ sent: number; failed: number } | null>(null);
  const [blocked, setBlocked] = useState(false);
  // True from a successful create until the navigation lands: the submit
  // button and the close affordances stay locked, so a second tap cannot
  // create (and email) a second group.
  const [navigating, setNavigating] = useState(false);
  const [pending, start] = useTransition();
  const uid = useId();
  // Idempotency key of THIS dialog session: a replayed submit (double tap,
  // retry after a lost response) returns the stored group instead of making
  // another one. A fresh key on every reset.
  const clientKeyRef = useRef<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setRows([{ email: "", displayName: "" }]);
    setSelectedCandidates(new Set());
    setError(null);
    setSummary(null);
    setBlocked(false);
    setNavigating(false);
    clientKeyRef.current = null;
  };

  const handleOpenChange = (next: boolean) => {
    if (pending || navigating) return;
    setOpen(next);
    if (!next) reset();
  };

  const updateRow = (i: number, patch: Partial<MemberRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, { email: "", displayName: "" }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const toggleCandidate = (userId: string) => {
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (navigating) return;
    setError(null);

    // Client-side validation: skip fully empty rows, basic email regex for
    // any row carrying content. The action re-validates server-side anyway.
    const members: { email: string; displayName?: string }[] = [];
    for (const row of rows) {
      const rowEmail = row.email.trim();
      const rowName = row.displayName.trim();
      if (!rowEmail && !rowName) continue;
      if (!EMAIL_RE.test(rowEmail)) {
        setError(t.errorGeneric);
        return;
      }
      members.push({ email: rowEmail, displayName: rowName || undefined });
    }

    clientKeyRef.current ??= crypto.randomUUID();
    const clientKey = clientKeyRef.current;

    start(async () => {
      try {
        const result = await createGroupWithMembers({
          name: trimmedName,
          description: description.trim() || undefined,
          members,
          coCupperUserIds: [...selectedCandidates],
          locale: locale === "en" ? "en" : "es",
          clientKey,
        });
        if (!result.ok) {
          setError(t.errorGeneric);
          return;
        }
        setNavigating(true);
        if (result.emailBlocked === "rate_limited") {
          setBlocked(true);
          setTimeout(() => {
            router.push(`/${locale}/app/groups/${result.groupId}`);
          }, 2600);
        } else if (result.emailSummary) {
          setSummary({ sent: result.emailSummary.sent, failed: result.emailSummary.failed });
          setTimeout(() => {
            router.push(`/${locale}/app/groups/${result.groupId}`);
          }, 1400);
        } else {
          router.push(`/${locale}/app/groups/${result.groupId}`);
        }
      } catch {
        setError(t.errorGeneric);
      }
    });
  };

  const inputCls =
    "w-full px-3 py-2 border border-outline-variant rounded-input text-caption bg-surface-container-lowest text-on-surface focus:border-primary-container";
  const labelCls = "label-caps block";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-1.5 px-4 py-2 rounded-pill bg-primary-container text-white text-caption font-semibold hover:opacity-90 transition-opacity"
      >
        <Plus size={16} aria-hidden />
        {t.createGroupCta}
      </button>

      <ResponsiveDialog open={open} onOpenChange={handleOpenChange} title={t.createGroupTitle} closeLabel={t.closeLabel}>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-name`} className={labelCls}>
              {t.groupName}
            </label>
            <input
              id={`${uid}-name`}
              autoFocus
              className={inputCls + " min-h-[44px]"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              maxLength={80}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${uid}-description`} className={labelCls}>
              {t.descriptionLabel}
            </label>
            <textarea
              id={`${uid}-description`}
              className={inputCls + " min-h-[72px]"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.descriptionPlaceholder}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <p id={`${uid}-members`} className={labelCls}>
              {t.membersSectionTitle}
            </p>
            <div role="group" aria-labelledby={`${uid}-members`} className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2">
                  <div className="space-y-1.5 sm:flex-1">
                    <label htmlFor={`${uid}-email-${i}`} className={labelCls}>
                      {t.emailLabel}
                    </label>
                    <input
                      id={`${uid}-email-${i}`}
                      type="email"
                      className={inputCls + " min-h-[44px]"}
                      value={row.email}
                      onChange={(e) => updateRow(i, { email: e.target.value })}
                      placeholder={t.emailPlaceholder}
                    />
                  </div>
                  <div className="space-y-1.5 sm:flex-1">
                    <label htmlFor={`${uid}-display-${i}`} className={labelCls}>
                      {t.displayNamePlaceholder}
                    </label>
                    <input
                      id={`${uid}-display-${i}`}
                      className={inputCls + " min-h-[44px]"}
                      value={row.displayName}
                      onChange={(e) => updateRow(i, { displayName: e.target.value })}
                      placeholder={t.displayNamePlaceholder}
                      maxLength={80}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    title={t.removeRow}
                    aria-label={t.removeRowNamed.replace("{n}", String(i + 1))}
                    className={`${HIT_44} shrink-0 self-start sm:self-end p-2 text-on-surface-variant hover:text-error transition-colors`}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-caption font-semibold text-primary-container hover:opacity-80 transition-opacity"
            >
              <Plus size={14} aria-hidden /> {t.addAnotherMember}
            </button>
          </div>

          {candidates.length > 0 && (
            <div className="space-y-2">
              <p id={`${uid}-quick-add`} className={labelCls}>
                {t.quickAddTitle}
              </p>
              <div role="group" aria-labelledby={`${uid}-quick-add`} className="flex flex-wrap gap-2">
                {candidates.map((c) => {
                  const selected = selectedCandidates.has(c.userId);
                  return (
                    <button
                      key={c.userId}
                      type="button"
                      onClick={() => toggleCandidate(c.userId)}
                      aria-pressed={selected}
                      className={
                        "inline-flex min-h-[44px] items-center gap-1 px-3 py-1.5 rounded-pill text-caption font-semibold border transition-colors " +
                        (selected
                          ? "bg-primary-container text-white border-primary-container"
                          : "bg-surface-container-lowest text-on-surface border-outline-variant hover:border-primary-container")
                      }
                    >
                      {selected && <Check size={12} />}
                      {c.displayName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <p className="text-caption text-error" role="alert">
              {error}
            </p>
          )}
          {blocked && (
            <p className="text-caption text-secondary font-semibold" role="status">
              {t.invitesRateLimited}
            </p>
          )}
          {summary && (
            <p className="text-caption text-primary-container font-semibold">
              {formatTemplate(t.invitesSentSummaryTemplate, summary)}
            </p>
          )}

          <div className="flex justify-end pt-2 border-t border-outline-variant">
            <button
              type="submit"
              disabled={pending || navigating || !name.trim()}
              className="inline-flex min-h-[44px] items-center gap-1.5 px-5 py-2.5 rounded-pill bg-primary-container text-white text-caption font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {pending ? t.creating : t.createAndInvite}
            </button>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
