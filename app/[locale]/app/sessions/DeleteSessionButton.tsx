"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteSession, getDeleteImpact, type DeleteImpact } from "@/app/actions/sessions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Badge } from "@/components/ui/Badge";
import { formatCoffeeCode } from "@/lib/coffeeCode";

export type DeleteSessionTranslations = {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  error: string;
  loadingImpact: string;
  coffeesIntro: string;
  you: string;
  // Contains the literal placeholders {evaluations} and {cuppers} —
  // interpolated client-side via .replace() (ICU plurals need next-intl,
  // which only runs server-side in this codebase).
  impact: string;
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

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && impact === null && !loadingImpact) {
      setLoadingImpact(true);
      getDeleteImpact(sessionId)
        .then(setImpact)
        .catch(() => setImpact(null))
        .finally(() => setLoadingImpact(false));
    }
  };

  const handleConfirm = async () => {
    await deleteSession(sessionId, locale);
    router.refresh();
  };

  const dialogBody =
    loadingImpact || !impact ? (
      <p>{t.loadingImpact}</p>
    ) : (
      <div className="space-y-3">
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
          {t.impact
            .replace("{evaluations}", String(impact.evaluationCount))
            .replace("{cuppers}", String(impact.cupperCount))}
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
