"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { duplicateSession } from "@/app/actions/sessions";
import { duplicateCoffee } from "@/app/actions/coffees";
import { duplicateGroup } from "@/app/actions/groups";
import { useActionFeedback } from "@/components/ui/Toast";

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
  droppedText,
  variant = "pill",
}: {
  kind: "session" | "coffee" | "group";
  id: string;
  locale: string;
  label: string;
  errorText: string;
  /** Raw template with a `{count}` placeholder (session kind only). */
  droppedText?: string;
  variant?: "icon" | "pill";
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const handleClick = () => {
    setFailed(false);
    start(async () => {
      try {
        if (kind === "session") {
          const res = await duplicateSession(id, locale);
          // Samples whose coffee the caller can no longer use became
          // coffee-less: say so. The provider lives in the locale layout, so
          // the toast survives the navigation below. The ICU `{count}` string
          // arrives raw and is replaced here (calling t() without the arg
          // would render the key).
          if (res.droppedCoffees > 0 && droppedText) {
            feedback.notifySuccess(droppedText.replace("{count}", String(res.droppedCoffees)));
          }
          router.push(`/${locale}/app/sessions/${res.sessionId}/edit`);
        } else if (kind === "coffee") {
          const res = await duplicateCoffee(id, locale);
          if (!res.ok) {
            // run() returns the failure instead of throwing (S8-10 T12).
            setFailed(true);
            return;
          }
          router.push(`/${locale}/app/coffees/${res.data.coffeeId}/edit`);
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
      <span className="inline-flex flex-col items-start">
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
        {/* Visible, not just a tooltip (S8-10 T8, F-sesiones-8). */}
        {failed && (
          <span role="alert" className="text-xs text-error">
            {errorText}
          </span>
        )}
      </span>
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
