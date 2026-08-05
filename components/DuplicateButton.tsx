"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { duplicateSession } from "@/app/actions/sessions";
import { duplicateCoffee } from "@/app/actions/coffees";
import { duplicateGroup } from "@/app/actions/groups";

/** "Use as template" — duplicates a session/coffee/group and lands the user on
 *  the copy's edit surface. One component for all three so the affordance looks
 *  identical everywhere. `variant="icon"` fits table row actions; `"pill"` sits
 *  next to page-level Editar/Eliminar buttons. */
export function DuplicateButton({
  kind,
  id,
  locale,
  label,
  errorText,
  variant = "pill",
}: {
  kind: "session" | "coffee" | "group";
  id: string;
  locale: string;
  label: string;
  errorText: string;
  variant?: "icon" | "pill";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const handleClick = () => {
    setFailed(false);
    start(async () => {
      try {
        if (kind === "session") {
          const res = await duplicateSession(id, locale);
          router.push(`/${locale}/app/sessions/${res.sessionId}/edit`);
        } else if (kind === "coffee") {
          const res = await duplicateCoffee(id, locale);
          router.push(`/${locale}/app/coffees/${res.coffeeId}/edit`);
        } else {
          const res = await duplicateGroup(id, locale);
          router.push(`/${locale}/app/groups/${res.groupId}`);
        }
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label={label}
        title={failed ? errorText : label}
        className={`inline-flex rounded-sm p-1.5 transition-colors disabled:opacity-40 ${
          failed
            ? "text-error"
            : "text-on-surface-variant hover:text-primary-container"
        }`}
      >
        <Copy size={16} />
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-pill border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
      >
        <Copy size={15} />
        {label}
      </button>
      {failed && <span className="text-xs text-error">{errorText}</span>}
    </span>
  );
}
