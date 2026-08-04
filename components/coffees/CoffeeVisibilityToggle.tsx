"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCoffeeVisibility } from "@/app/actions/coffees";
import type { CoffeeVisibility } from "@/lib/coffeeAccess";

type Props = {
  coffeeId: string;
  visibility: CoffeeVisibility;
  translations: {
    recordPrivate: string;
    recordShared: string;
    recordPublic: string;
    confirmMakePublic: string;
  };
};

const ARM_TIMEOUT_MS = 3000;

// Owner-only control on the coffee profile page: a three-option segmented
// control (private / shared / public). Switching TO public keeps the inline
// two-step confirm from the old boolean toggle (first click "arms" the option
// for 3s, second click within that window commits) rather than
// window.confirm(), which breaks automated browser testing. Private and
// shared are single-click — non-destructive, they only narrow who can see the
// record. Note: switching a shared coffee to private keeps its CoffeeShare
// rows but makes them inert (see lib/coffeeAccess.ts).
export function CoffeeVisibilityToggle({ coffeeId, visibility, translations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const armTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (armTimeout.current) clearTimeout(armTimeout.current);
    };
  }, []);

  function commit(next: CoffeeVisibility) {
    startTransition(async () => {
      await setCoffeeVisibility(coffeeId, next);
      router.refresh();
    });
  }

  function handleSelect(next: CoffeeVisibility) {
    if (next === visibility) return;
    if (next !== "public") {
      if (armTimeout.current) clearTimeout(armTimeout.current);
      setArmed(false);
      commit(next);
      return;
    }
    if (!armed) {
      setArmed(true);
      armTimeout.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
      return;
    }
    if (armTimeout.current) clearTimeout(armTimeout.current);
    setArmed(false);
    commit("public");
  }

  const options: Array<{ value: CoffeeVisibility; label: string }> = [
    { value: "private", label: translations.recordPrivate },
    { value: "shared", label: translations.recordShared },
    {
      value: "public",
      label:
        armed && visibility !== "public"
          ? translations.confirmMakePublic
          : translations.recordPublic,
    },
  ];

  return (
    <div
      role="radiogroup"
      className="inline-flex rounded-pill border border-brown-light overflow-hidden"
    >
      {options.map((opt, i) => {
        const active = visibility === opt.value;
        const armedPublic = opt.value === "public" && armed && !active;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => handleSelect(opt.value)}
            disabled={isPending}
            className={`text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              i > 0 ? "border-l border-brown-light" : ""
            } ${
              active
                ? "bg-green-dark text-white"
                : armedPublic
                  ? "bg-amber-warm/20 text-brown-dark"
                  : "bg-white text-brown-mid hover:bg-cream"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
