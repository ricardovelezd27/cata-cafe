"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCoffeeResultsPublished } from "@/app/actions/coffees";

type Props = {
  coffeeId: string;
  resultsPublished: boolean;
  translations: {
    published: string;
    unpublished: string;
    publish: string;
    unpublish: string;
    confirmPublish: string;
  };
};

const ARM_TIMEOUT_MS = 3000;

// Owner-only control on the coffee profile page. Publishing requires an
// inline two-step confirm (first click "arms" the button for 3s, second
// click within that window commits) rather than window.confirm(), which
// breaks automated browser testing. Unpublishing is a single click — it's
// non-destructive to data, just hides the section from non-owners again.
export function PublishResultsToggle({ coffeeId, resultsPublished, translations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const armTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (armTimeout.current) clearTimeout(armTimeout.current);
    };
  }, []);

  function commit(next: boolean) {
    startTransition(async () => {
      await setCoffeeResultsPublished(coffeeId, next);
      router.refresh();
    });
  }

  function handleClick() {
    if (resultsPublished) {
      commit(false);
      return;
    }
    if (!armed) {
      setArmed(true);
      armTimeout.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
      return;
    }
    if (armTimeout.current) clearTimeout(armTimeout.current);
    setArmed(false);
    commit(true);
  }

  const badgeClass = resultsPublished
    ? "bg-primary-container/10 text-primary-container border-primary-container/30"
    : "bg-surface-container text-on-surface-variant border-outline-variant";

  return (
    <div className="flex items-center gap-3">
      <span
        className={`text-xs font-semibold px-2.5 py-1 rounded-pill border ${badgeClass}`}
      >
        {resultsPublished ? translations.published : translations.unpublished}
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs font-semibold px-3 py-1.5 rounded-pill border border-outline-variant text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {resultsPublished
          ? translations.unpublish
          : armed
            ? translations.confirmPublish
            : translations.publish}
      </button>
    </div>
  );
}
