"use client";

// Single-screen "create a tasting group" flow: name + description + an
// optional roster of email invitees, plus one-tap chips for co-cuppers the
// maestro has already cupped with. Fully replaces the old bare
// CreateGroupForm — group creation and the initial invite blast now happen
// in one atomic call to createGroupWithMembers.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check } from "lucide-react";
import { createGroupWithMembers } from "@/app/actions/groups";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";

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
  errorGeneric: string;
  closeLabel: string;
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
  const [pending, start] = useTransition();

  const reset = () => {
    setName("");
    setDescription("");
    setRows([{ email: "", displayName: "" }]);
    setSelectedCandidates(new Set());
    setError(null);
    setSummary(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
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

    start(async () => {
      try {
        const result = await createGroupWithMembers({
          name: trimmedName,
          description: description.trim() || undefined,
          members,
          coCupperUserIds: [...selectedCandidates],
          locale: locale === "en" ? "en" : "es",
        });
        if (!result.ok) {
          setError(t.errorGeneric);
          return;
        }
        if (result.emailSummary) {
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
    "w-full px-3 py-2 border border-outline-variant rounded-input text-sm bg-surface-container-lowest text-on-surface focus:outline-none focus:border-primary-container";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-pill bg-primary-container text-white text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        <Plus size={16} />
        {t.createGroupCta}
      </button>

      <ResponsiveDialog open={open} onOpenChange={handleOpenChange} title={t.createGroupTitle} closeLabel={t.closeLabel}>
        <form onSubmit={onSubmit} className="space-y-5">
          <input
            autoFocus
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.namePlaceholder}
            maxLength={80}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
              {t.descriptionLabel}
            </label>
            <textarea
              className={inputCls + " min-h-[72px]"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.descriptionPlaceholder}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
              {t.membersSectionTitle}
            </label>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    className={inputCls + " sm:flex-1"}
                    value={row.email}
                    onChange={(e) => updateRow(i, { email: e.target.value })}
                    placeholder={t.emailPlaceholder}
                  />
                  <input
                    className={inputCls + " sm:flex-1"}
                    value={row.displayName}
                    onChange={(e) => updateRow(i, { displayName: e.target.value })}
                    placeholder={t.displayNamePlaceholder}
                    maxLength={80}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    title={t.removeRow}
                    className="shrink-0 self-start sm:self-center p-2 text-on-surface-variant hover:text-error transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-container hover:opacity-80 transition-opacity"
            >
              <Plus size={14} /> {t.addAnotherMember}
            </button>
          </div>

          {candidates.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
                {t.quickAddTitle}
              </label>
              <div className="flex flex-wrap gap-2">
                {candidates.map((c) => {
                  const selected = selectedCandidates.has(c.userId);
                  return (
                    <button
                      key={c.userId}
                      type="button"
                      onClick={() => toggleCandidate(c.userId)}
                      className={
                        "inline-flex items-center gap-1 px-3 py-1.5 rounded-pill text-xs font-semibold border transition-colors " +
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

          {error && <p className="text-xs text-error">{error}</p>}
          {summary && (
            <p className="text-xs text-primary-container font-semibold">
              {formatTemplate(t.invitesSentSummaryTemplate, summary)}
            </p>
          )}

          <div className="flex justify-end pt-2 border-t border-outline-variant">
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-pill bg-primary-container text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {pending ? t.creating : t.createAndInvite}
            </button>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
