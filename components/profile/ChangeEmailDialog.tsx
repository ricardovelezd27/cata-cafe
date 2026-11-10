"use client";

import { useId, useState, useTransition } from "react";
import { requestEmailChange } from "@/app/actions/auth";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Button } from "@/components/ui/Button";
import { useActionFeedback } from "@/components/ui/Toast";

export type ChangeEmailStrings = {
  open: string;
  title: string;
  body: string;
  label: string;
  submit: string;
  sending: string;
  /** Raw template with a literal "{email}". */
  sent: string;
  close: string;
};

/**
 * "Cambiar correo" (S8-07, F-cuenta-5). Registered users only: the caller does
 * not render it for guests. The action mails a confirmation link to the new
 * address; the address only changes when that link is opened.
 */
export function ChangeEmailDialog({
  locale,
  strings: t,
}: {
  locale: string;
  strings: ChangeEmailStrings;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const feedback = useActionFeedback();
  const inputId = useId();

  const submit = () => {
    startTransition(async () => {
      await feedback.run(requestEmailChange(email.trim(), locale), (data) => {
        setSentTo(data.pending);
        setEmail("");
      });
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        onClick={() => {
          setSentTo(null);
          setOpen(true);
        }}
      >
        {t.open}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={t.title} closeLabel={t.close}>
        {sentTo ? (
          <p role="status" className="text-sm leading-relaxed text-on-surface">
            {t.sent.replace("{email}", sentTo)}
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <p className="text-sm leading-relaxed text-on-surface-variant">{t.body}</p>
            <div>
              <label
                htmlFor={inputId}
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant"
              >
                {t.label}
              </label>
              <input
                id={inputId}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-input border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface transition-colors focus:border-primary-container focus:outline-none focus:ring-2 focus:ring-primary-container/25"
              />
            </div>
            <Button type="submit" disabled={pending || !email.trim()} aria-busy={pending}>
              {pending ? t.sending : t.submit}
            </Button>
          </form>
        )}
      </ResponsiveDialog>
    </>
  );
}
