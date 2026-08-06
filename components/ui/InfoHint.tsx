"use client";

/**
 * Small inline "what is this" trigger for in-app help. Deliberately dumb and
 * reusable: caller supplies the title/body/closeLabel strings (already
 * translated), this component only owns the open/close state and the dialog
 * chrome. Body paragraphs are split on "\n" so callers can author multi-
 * paragraph explanations as a single translated string.
 */

import { useState } from "react";
import { Info } from "lucide-react";
import { ResponsiveDialog } from "./ResponsiveDialog";

export function InfoHint({
  title,
  body,
  closeLabel,
  className = "",
}: {
  title: string;
  body: string;
  closeLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const paragraphs = body.split("\n").filter((p) => p.trim().length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        className={`inline-flex shrink-0 items-center justify-center -m-1.5 rounded-pill p-2.5 text-on-surface-variant transition-colors hover:text-primary-container ${className}`}
      >
        <Info size={15} aria-hidden />
      </button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={title} closeLabel={closeLabel}>
        <div className="flex flex-col gap-3">
          {paragraphs.map((paragraph, idx) => (
            <p key={idx} className="text-sm leading-relaxed text-on-surface-variant">
              {paragraph}
            </p>
          ))}
        </div>
      </ResponsiveDialog>
    </>
  );
}
