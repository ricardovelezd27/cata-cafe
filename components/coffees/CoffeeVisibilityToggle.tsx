"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCoffeeVisibility } from "@/app/actions/coffees";
import { useActionFeedback } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { CoffeeVisibility } from "@/lib/coffeeAccess";

type Props = {
  coffeeId: string;
  visibility: CoffeeVisibility;
  /** People who still hold an (inert) share row — listed before re-sharing a private coffee. */
  previousShares?: { userId: string; displayName: string }[];
  translations: {
    recordPrivate: string;
    recordShared: string;
    recordPublic: string;
    confirmMakePublic: string;
    makePublic: string;
    returnTitle: string;
    returnBody: string;
    returnKeep: string;
    returnClear: string;
    returnConfirm: string;
    returnLinksNote: string;
    dialogCancel: string;
    dialogClose: string;
  };
};

// Owner-only control on the coffee profile page: a three-option segmented
// control (private / shared / public). Switching TO public asks first, in the
// kit's ConfirmDialog (C-09, P3b; it replaced a "tap twice within 3 seconds"
// arm); confirming runs the same requestCommit("public") as before. Private and
// shared are single-click — non-destructive, they only narrow who can see the
// record. Note: switching a shared coffee to private keeps its CoffeeShare
// rows but makes them inert (see lib/coffeeAccess.ts).
export function CoffeeVisibilityToggle({
  coffeeId,
  visibility,
  previousShares = [],
  translations,
}: Props) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const [isPending, startTransition] = useTransition();
  const [askPublic, setAskPublic] = useState(false);
  // Returning from private to shared/public: show who would regain access and
  // let the owner keep or clear them first (S8-12, F-cafes-5).
  const [returning, setReturning] = useState<CoffeeVisibility | null>(null);
  const [clearPrevious, setClearPrevious] = useState(false);

  function commit(next: CoffeeVisibility, clearShares = false) {
    startTransition(async () => {
      await feedback.run(setCoffeeVisibility(coffeeId, next, clearShares), () => router.refresh());
    });
  }

  // private -> shared/public with people still on file asks first; everything
  // else commits straight away.
  function requestCommit(next: CoffeeVisibility) {
    if (visibility === "private" && next !== "private" && previousShares.length > 0) {
      setClearPrevious(false);
      setReturning(next);
      return;
    }
    commit(next);
  }

  function handleSelect(next: CoffeeVisibility) {
    if (next === visibility) return;
    if (next !== "public") {
      requestCommit(next);
      return;
    }
    setAskPublic(true);
  }

  const options: Array<{ value: CoffeeVisibility; label: string }> = [
    { value: "private", label: translations.recordPrivate },
    { value: "shared", label: translations.recordShared },
    { value: "public", label: translations.recordPublic },
  ];

  return (
    <>
    <div
      role="radiogroup"
      className="inline-flex rounded-pill border border-outline overflow-hidden"
    >
      {options.map((opt, i) => {
        const active = visibility === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => handleSelect(opt.value)}
            disabled={isPending}
            className={`inline-flex min-h-[44px] items-center text-caption px-3 py-1.5 transition-colors disabled:opacity-60 disabled:cursor-default ${
              i > 0 ? "border-l border-outline" : ""
            } ${
              active
                ? "bg-primary-fixed font-semibold text-on-primary-fixed"
                : "font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:bg-surface-container active:text-on-surface"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
    <ConfirmDialog
      open={askPublic}
      onOpenChange={setAskPublic}
      title={translations.makePublic}
      body={translations.confirmMakePublic}
      confirmLabel={translations.makePublic}
      cancelLabel={translations.dialogCancel}
      closeLabel={translations.dialogClose}
      destructive={false}
      onConfirm={() => {
        requestCommit("public");
      }}
    />
    <ConfirmDialog
      open={returning !== null}
      onOpenChange={(o) => {
        if (!o) setReturning(null);
      }}
      title={translations.returnTitle}
      body={
        <div className="space-y-3">
          <p>{translations.returnBody}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {previousShares.map((s) => (
              <li key={s.userId}>{s.displayName}</li>
            ))}
          </ul>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-body">
            <input
              type="radio"
              name="previous-shares"
              checked={!clearPrevious}
              onChange={() => setClearPrevious(false)}
              className="h-4 w-4 accent-primary-container"
            />
            {translations.returnKeep}
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-body">
            <input
              type="radio"
              name="previous-shares"
              checked={clearPrevious}
              onChange={() => setClearPrevious(true)}
              className="h-4 w-4 accent-primary-container"
            />
            {translations.returnClear}
          </label>
          <p className="text-caption text-on-surface-variant">{translations.returnLinksNote}</p>
        </div>
      }
      confirmLabel={translations.returnConfirm}
      cancelLabel={translations.dialogCancel}
      closeLabel={translations.dialogClose}
      destructive={false}
      onConfirm={async () => {
        if (returning) commit(returning, clearPrevious);
      }}
    />
    </>
  );
}
