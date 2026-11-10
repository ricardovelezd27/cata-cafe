"use client";

import { useId, useState, useTransition } from "react";
import { deleteAccount, getMyAccountDeletionImpact } from "@/app/actions/account";
import type { AccountDeletionImpact } from "@/lib/accountDeletion/plan";
import { clearLocalDeviceState } from "@/lib/offline/deviceState";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Button } from "@/components/ui/Button";
import { useActionFeedback } from "@/components/ui/Toast";

export type DeleteAccountStrings = {
  open: string;
  title: string;
  intro: string;
  loading: string;
  /** Raw templates with a literal "{n}". */
  impactSessionsDeleted: string;
  impactSessionsKept: string;
  impactEvaluations: string;
  impactCoffees: string;
  impactGroupsKept: string;
  impactGroupsDeleted: string;
  impactNothing: string;
  keepScores: string;
  keepCoffees: string;
  irreversible: string;
  protectedBody: string;
  /** Raw template with a literal "{word}". */
  typeLabel: string;
  word: string;
  submit: string;
  deleting: string;
  cancel: string;
  close: string;
};

/**
 * "Eliminar cuenta" (S8-19, F-cuenta-1). Shown to everyone, guests included.
 * Opening it fetches the counts (self only); the delete needs the typed word,
 * which the server checks again. On success this device's caches and the
 * person's offline drafts are cleared, then a full navigation to the landing.
 */
export function DeleteAccountDialog({
  locale,
  strings: t,
  className,
}: {
  locale: string;
  strings: DeleteAccountStrings;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<AccountDeletionImpact | null>(null);
  const [typed, setTyped] = useState("");
  const [loading, startLoading] = useTransition();
  const [pending, startDelete] = useTransition();
  const feedback = useActionFeedback();
  const inputId = useId();

  const openDialog = () => {
    setTyped("");
    setImpact(null);
    setOpen(true);
    startLoading(async () => {
      const result = await feedback.run(getMyAccountDeletionImpact());
      if (result.ok) setImpact(result.data);
      else setOpen(false);
    });
  };

  const confirmed = typed.trim().toUpperCase() === t.word;

  const submit = () => {
    if (!confirmed) return;
    startDelete(async () => {
      await feedback.run(deleteAccount(typed, locale), async (data) => {
        await clearLocalDeviceState();
        try {
          const { removeUserDrafts } = await import("@/lib/offline/store");
          await removeUserDrafts(data.userId);
        } catch {
          // the store may be unavailable in this browser
        }
        window.location.assign(data.next);
      });
    });
  };

  const lines: string[] = [];
  if (impact && !impact.protected) {
    const add = (n: number, tpl: string) => {
      if (n > 0) lines.push(tpl.replace("{n}", String(n)));
    };
    add(impact.sessionsDeleted, t.impactSessionsDeleted);
    add(impact.sessionsKept, t.impactSessionsKept);
    add(impact.evaluationsAnonymized, t.impactEvaluations);
    add(impact.coffeesAnonymized, t.impactCoffees);
    add(impact.groupsKept, t.impactGroupsKept);
    add(impact.groupsDeleted, t.impactGroupsDeleted);
  }

  return (
    <>
      <Button variant="danger" size="md" className={className} onClick={openDialog}>
        {t.open}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o);
        }}
        title={t.title}
        closeLabel={t.close}
      >
        {loading || !impact ? (
          <p role="status" className="text-sm text-on-surface-variant">
            {t.loading}
          </p>
        ) : impact.protected ? (
          <p className="text-sm leading-relaxed text-on-surface">{t.protectedBody}</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <p className="text-sm leading-relaxed text-on-surface">{t.intro}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-on-surface">
              {lines.length > 0 ? lines.map((l) => <li key={l}>{l}</li>) : <li>{t.impactNothing}</li>}
            </ul>
            <div className="space-y-2 rounded-card border border-outline-variant bg-surface-container-low p-3 text-sm leading-relaxed text-on-surface-variant">
              <p>{t.keepScores}</p>
              <p>{t.keepCoffees}</p>
              <p className="font-semibold text-error">{t.irreversible}</p>
            </div>
            <div>
              <label
                htmlFor={inputId}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant"
              >
                {t.typeLabel.replace("{word}", t.word)}
              </label>
              <input
                id={inputId}
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={pending}
                className="w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface transition-colors focus:border-error focus:outline-none focus:ring-2 focus:ring-error/25"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button type="submit" variant="danger" disabled={!confirmed || pending} aria-busy={pending}>
                {pending ? t.deleting : t.submit}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                {t.cancel}
              </Button>
            </div>
          </form>
        )}
      </ResponsiveDialog>
    </>
  );
}
