"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { HowItWorks, type HowItWorksStrings } from "@/components/onboarding/HowItWorks";

/**
 * Where "Cómo funciona" lives once onboarding is over: a button on the profile (the
 * one page every account reaches on a phone and on a desktop) that opens the same
 * content as the welcome dialog's second step.
 */
export function HowItWorksDialog({
  strings,
  open: openLabel,
  close,
}: {
  strings: HowItWorksStrings;
  open: string;
  close: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        {openLabel}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={strings.eyebrow} closeLabel={close}>
        <HowItWorks t={strings} />
      </ResponsiveDialog>
    </>
  );
}
