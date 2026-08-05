"use client";

import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";

export type UsableCoffee = {
  id: string;
  name: string;
  producer: string | null;
  variety: string | null;
  altitude: string | null;
  roastLevel: string | null;
  country: string | null;
  region: string | null;
  processType: string | null;
  origin: "mine" | "shared" | "public";
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coffees: UsableCoffee[];
  onSelect: (coffee: UsableCoffee) => void;
  translations: {
    title: string;
    searchPlaceholder: string;
    mine: string;
    shared: string;
    public: string;
    empty: string;
  };
};

const badgeCls: Record<UsableCoffee["origin"], string> = {
  mine: "bg-green-dark/10 text-green-dark border-green-dark/30",
  shared: "bg-amber-warm/15 text-brown-dark border-amber-warm/40",
  public: "bg-cream text-brown-mid border-brown-light",
};

export function CoffeePicker({ open, onOpenChange, coffees, onSelect, translations: t }: Props) {
  const [query, setQuery] = useState("");

  const fuse = useMemo(
    () =>
      new Fuse(coffees, {
        keys: ["name", "country", "region", "variety", "producer"],
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [coffees]
  );

  const trimmed = query.trim();
  const results =
    trimmed.length < 2 ? coffees : fuse.search(trimmed).map((r) => r.item);

  const badgeLabel = (origin: UsableCoffee["origin"]) =>
    origin === "mine" ? t.mine : origin === "shared" ? t.shared : t.public;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={t.title}>
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.searchPlaceholder}
        aria-label={t.searchPlaceholder}
        autoComplete="off"
        className="w-full rounded-pill border-[1.5px] border-brown-light/60 bg-bg px-4 py-2 text-sm text-brown-dark placeholder:text-brown-mid focus:border-green-mid focus:outline-none"
      />

      <div className="mt-3 max-h-[50vh] overflow-y-auto">
        {results.length === 0 ? (
          <p className="py-8 text-center text-sm text-brown-mid">{t.empty}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {results.map((coffee) => {
              const subtitle = [coffee.country, coffee.region, coffee.variety]
                .filter(Boolean)
                .join(" · ");
              return (
                <button
                  key={coffee.id}
                  type="button"
                  onClick={() => onSelect(coffee)}
                  className="flex flex-col items-start gap-1 rounded-card border border-brown-light/40 px-3.5 py-2.5 text-left transition-colors hover:bg-cream"
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="font-semibold text-[13px] text-brown-dark">
                      {coffee.name}
                    </span>
                    <span
                      className={`ml-auto shrink-0 rounded-pill border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badgeCls[coffee.origin]}`}
                    >
                      {badgeLabel(coffee.origin)}
                    </span>
                  </div>
                  {subtitle && (
                    <span className="text-[12px] text-brown-mid">{subtitle}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
