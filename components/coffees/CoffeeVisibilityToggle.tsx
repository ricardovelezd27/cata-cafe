"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCoffeeVisibility } from "@/app/actions/coffees";

type Props = {
  coffeeId: string;
  isPublic: boolean;
  translations: {
    recordPublic: string;
    recordPrivate: string;
    makePublic: string;
    makePrivate: string;
    confirmMakePublic: string;
  };
};

const ARM_TIMEOUT_MS = 3000;

// Owner-only control on the coffee profile page. Mirrors PublishResultsToggle:
// making the record public requires an inline two-step confirm (first click
// "arms" the button for 3s, second click within that window commits) rather
// than window.confirm(), which breaks automated browser testing. Making it
// private again is a single click — it's non-destructive to data, just hides
// the record from non-owners again.
export function CoffeeVisibilityToggle({ coffeeId, isPublic, translations }: Props) {
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
      await setCoffeeVisibility(coffeeId, next);
      router.refresh();
    });
  }

  function handleClick() {
    if (isPublic) {
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

  const badgeClass = isPublic
    ? "bg-green-dark/10 text-green-dark border-green-dark/30"
    : "bg-cream text-brown-mid border-brown-light";

  return (
    <div className="flex items-center gap-3">
      <span
        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeClass}`}
      >
        {isPublic ? translations.recordPublic : translations.recordPrivate}
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-brown-light text-brown-dark hover:bg-cream transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPublic
          ? translations.makePrivate
          : armed
            ? translations.confirmMakePublic
            : translations.makePublic}
      </button>
    </div>
  );
}
