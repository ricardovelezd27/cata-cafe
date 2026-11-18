"use client";

import { ArrivalCard } from "@/components/arrival/ArrivalCard";
import { EmailSentState, type EmailSentLabels } from "@/components/auth/EmailSentState";
import { GuestIdentityChoice, type GuestIdentityTranslations } from "@/components/join/GuestIdentityChoice";

/** The real components, in the arrival card, with invented values (dev board only). */
export function ArrivalDevStates({
  state,
  locale,
  sent,
  sessionName,
  guest,
}: {
  state: "sent" | "guest";
  locale: string;
  sent: EmailSentLabels;
  sessionName: string;
  guest: GuestIdentityTranslations & { name: string };
}) {
  if (state === "sent") {
    return (
      <EmailSentState
        email="prueba@example.invalid"
        locale={locale}
        labels={sent}
        supportHref="mailto:soporte@example.invalid"
        arrival
        onResend={async () => ({ ok: true })}
        onChangeEmail={() => {}}
      />
    );
  }
  return (
    <ArrivalCard title={sessionName}>
      <GuestIdentityChoice
        mode="member"
        continueHref={`/${locale}/app`}
        userId="00000000-0000-0000-0000-000000000000"
        name={guest.name}
        token="00000000-0000-0000-0000-000000000000"
        locale={locale}
        translations={guest}
        errorMessages={{}}
      />
    </ArrivalCard>
  );
}
