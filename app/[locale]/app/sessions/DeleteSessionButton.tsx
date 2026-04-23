"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteSession } from "@/app/actions/sessions";

export function DeleteSessionButton({
  sessionId,
  locale,
}: {
  sessionId: string;
  locale: string;
}) {
  const [pending, start] = useTransition();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("¿Eliminar esta sesión? Esta acción no se puede deshacer.")) return;
    start(() => deleteSession(sessionId, locale));
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      aria-label="Eliminar sesión"
      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-brown-mid hover:text-red-defect hover:bg-red-defect/10 transition-colors"
    >
      <Trash2 size={15} />
    </button>
  );
}
