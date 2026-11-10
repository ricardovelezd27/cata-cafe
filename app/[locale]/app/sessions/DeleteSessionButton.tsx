"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteSession, getDeleteImpact, type DeleteImpact } from "@/app/actions/sessions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCoffeeCode } from "@/lib/coffeeCode";
import { fillTemplate } from "@/lib/deleteImpact";

export type DeleteSessionTranslations = {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  error: string;
  loadingImpact: string;
  impactFailed: string;
  retry: string;
  coffeesIntro: string;
  you: string;
  // Contains the literal placeholders {evaluations} and {cuppers} —
  // interpolated client-side via .replace() (ICU plurals need next-intl,
  // which only runs server-side in this codebase).
  impact: string;
  // {submitted} {drafts} {participants} — filled client-side from getDeleteImpact.
  detail: string;
};

export function DeleteSessionButton({
  sessionId,
  locale,
  translations: t,
}: {
  sessionId: string;
  locale: string;
  translations: DeleteSessionTranslations;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  const [impactFailed, setImpactFailed] = useState(false);

  const loadImpact = () => {
    setLoadingImpact(true);
    setImpactFailed(false);
    getDeleteImpact(sessionId)
      .then(setImpact)
      .catch(() => {
        setImpact(null);
        setImpactFailed(true);
      })
      .finally(() => setLoadingImpact(false));
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && impact === null && !loadingImpact) loadImpact();
  };

  const handleConfirm = async () => {
    await deleteSession(sessionId, locale);
    router.refresh();
  };

  const dialogBody =
    loadingImpact || !impact ? (
      impactFailed && !loadingImpact ? (
        <div className="space-y-3">
          <p role="alert">{t.impactFailed}</p>
          <Button type="button" variant="secondary" size="sm" onClick={loadImpact}>
            {t.retry}
          </Button>
        </div>
      ) : (
        <p>{t.loadingImpact}</p>
      )
    ) : (
      <div className="space-y-3">
        {/* The permanence line: what goes, and that it cannot be undone. */}
        <p className="font-medium text-on-surface">{t.body}</p>
        {impact.coffees.length > 0 && (
          <div className="space-y-1.5">
            <p>{t.coffeesIntro}</p>
            <ul className="space-y-1">
              {impact.coffees.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                  <span>
                    {c.name}
                    {c.code ? ` (${formatCoffeeCode(c.code)})` : ""} — {c.ownerName}
                  </span>
                  {c.ownedByMe && (
                    <Badge tone="outline" size="xs">
                      {t.you}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p>
          {fillTemplate(t.impact, {
            evaluations: impact.evaluationCount,
            cuppers: impact.cupperCount,
          })}
        </p>
        <p>
          {fillTemplate(t.detail, {
            submitted: impact.submittedCount,
            drafts: impact.draftCount,
            participants: impact.participantCount,
          })}
        </p>
      </div>
    );

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleOpenChange(true);
        }}
        aria-label={t.title}
        className="inline-flex rounded-sm p-1.5 text-on-surface-variant transition-colors hover:text-error"
      >
        <Trash2 size={16} />
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={t.title}
        body={dialogBody}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        closeLabel={t.cancel}
        onConfirm={handleConfirm}
        error={t.error}
        confirmDisabled={loadingImpact || !impact}
      />
    </>
  );
}
