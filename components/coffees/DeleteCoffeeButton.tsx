"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  deleteCoffees,
  getCoffeeDeleteImpact,
  type CoffeeDeleteImpact,
  type DeleteCoffeesResult,
} from "@/app/actions/coffees";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useActionFeedback } from "@/components/ui/Toast";

const MAX_LISTED_NAMES = 5;

export type DeleteCoffeeTranslations = {
  title: string;
  /** Contains {count}. */
  titleMany: string;
  body: string;
  confirm: string;
  /** Contains {count}. */
  confirmMany: string;
  cancel: string;
  error: string;
  loadingImpact: string;
  /** Contains {coffees} {samples} {sessions} {cuppers}. */
  impact: string;
  /** Contains {count}. */
  moreNames: string;
  success: string;
  /** Contains {count}. */
  successMany: string;
  /** Contains {skipped}. */
  partial: string;
};

// Placeholder strings are interpolated client-side via .replace() — ICU
// plurals need next-intl, which only runs server-side in this codebase.
const fill = (template: string, vars: Record<string, number>) =>
  Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    template,
  );

/**
 * One delete affordance for every coffee surface — profile page (`pill`),
 * table row (`icon`) and the bulk-selection toolbar (`bulk`). "Delete" is an
 * anonymization (see deleteCoffees): the dialog loads how much tasting data
 * stays linked before the owner confirms.
 */
export function DeleteCoffeeButton({
  coffeeIds,
  coffeeNames,
  variant,
  label,
  disabled = false,
  disabledHint,
  redirectTo,
  onDeleted,
  translations: t,
}: {
  coffeeIds: string[];
  /** Listed in the dialog body (first 5 + "y N más"). */
  coffeeNames?: string[];
  variant: "icon" | "pill" | "bulk";
  /** Pill/bulk text; the icon variant uses translations.title as aria-label. */
  label?: string;
  disabled?: boolean;
  /** Rendered as the trigger's `title` while disabled (e.g. over the bulk cap). */
  disabledHint?: string;
  /** Profile page: navigate here after a successful delete. */
  redirectTo?: string;
  /** Table: clear the selection after a successful delete. */
  onDeleted?: (result: DeleteCoffeesResult) => void;
  translations: DeleteCoffeeTranslations;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<{ key: string; data: CoffeeDeleteImpact | null } | null>(
    null,
  );
  const [loadingImpact, setLoadingImpact] = useState(false);

  const many = coffeeIds.length > 1;
  const key = coffeeIds.join(",");
  const impactData = impact?.key === key ? impact.data : null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && impact?.key !== key && !loadingImpact) {
      setLoadingImpact(true);
      getCoffeeDeleteImpact(coffeeIds)
        .then((res) => setImpact({ key, data: res.ok ? res.data : null }))
        .catch(() => setImpact({ key, data: null }))
        .finally(() => setLoadingImpact(false));
    }
  };

  const handleConfirm = async () => {
    const res = await deleteCoffees(coffeeIds);
    if (!res.ok) return res;
    // Close through Radix's own path BEFORE the caller clears the selection —
    // the bulk toolbar (and this button with it) unmounts on clear.
    setOpen(false);
    const { deleted, skipped } = res.data;
    feedback.notifySuccess(deleted === 1 ? t.success : fill(t.successMany, { count: deleted }));
    if (skipped > 0) feedback.notifySuccess(fill(t.partial, { skipped }));
    onDeleted?.(res.data);
    if (redirectTo) router.push(redirectTo);
    router.refresh();
    return res;
  };

  const names = coffeeNames ?? [];
  const shownNames = names.slice(0, MAX_LISTED_NAMES);
  const hiddenCount = names.length - shownNames.length;

  const dialogBody = (
    <div className="space-y-3">
      {shownNames.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 font-medium">
          {shownNames.map((n, i) => (
            <li key={`${i}-${n}`}>{n}</li>
          ))}
          {hiddenCount > 0 && (
            <li className="list-none -ml-5 text-on-surface-variant">
              {fill(t.moreNames, { count: hiddenCount })}
            </li>
          )}
        </ul>
      )}
      <p>{t.body}</p>
      {loadingImpact || !impactData ? (
        <p className="text-on-surface-variant">{loadingImpact ? t.loadingImpact : t.error}</p>
      ) : (
        <p className="text-on-surface-variant">
          {fill(t.impact, {
            coffees: impactData.coffees,
            samples: impactData.samples,
            sessions: impactData.sessions,
            cuppers: impactData.cuppers,
          })}
        </p>
      )}
    </div>
  );

  const trigger =
    variant === "icon" ? (
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
    ) : (
      <Button
        variant="danger"
        size={variant === "bulk" ? "sm" : "md"}
        icon={<Trash2 size={15} aria-hidden />}
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        onClick={() => handleOpenChange(true)}
      >
        {label ?? t.title}
      </Button>
    );

  return (
    <>
      {trigger}
      <ConfirmDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={many ? fill(t.titleMany, { count: coffeeIds.length }) : t.title}
        body={dialogBody}
        confirmLabel={many ? fill(t.confirmMany, { count: coffeeIds.length }) : t.confirm}
        cancelLabel={t.cancel}
        closeLabel={t.cancel}
        onConfirm={handleConfirm}
        error={t.error}
        confirmDisabled={loadingImpact || !impactData}
      />
    </>
  );
}
