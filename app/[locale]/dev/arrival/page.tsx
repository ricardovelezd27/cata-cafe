import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrivalCard } from "@/components/arrival/ArrivalCard";
import { ArrivalStage } from "@/components/arrival/ArrivalStage";
import { emailSentCopy } from "@/components/auth/authCopy";
import { Button } from "@/components/ui";
import { ArrivalDevStates } from "./ArrivalDevStates";

// Dev-only review board for the arrival states no test account can reach
// without writing (package S8): "check your email" (the real EmailSentState),
// "Vas a entrar como …" (drawn with the card and the confirm page's own words:
// the real state needs a real emailed link), and "¿Eres {nombre}?" (the real
// GuestIdentityChoice, which needs an anonymous user to be useful). Nothing
// here is pressed: every button calls the real action, and the capture browser
// blocks writes. Outside `next dev` it is a 404. Never prerendered.
export const dynamic = "force-dynamic";

export default async function ArrivalDevPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { locale } = await params;
  const { state } = await searchParams;
  setRequestLocale(locale);
  const loc = locale === "en" ? "en" : "es";
  const t = await getTranslations("auth");
  const tc = await getTranslations("auth.confirm");
  const tg = await getTranslations("group");
  const name = loc === "en" ? "Guest One" : "Invitado Uno";

  if (state === "identity") {
    return (
      <ArrivalStage locale={loc}>
        <ArrivalCard
          title={tc("identityTitle")}
          lead={<p className="break-words">{(tc.raw("identityBody") as string).replace("{email}", "prueba@example.invalid")}</p>}
          actions={
            <>
              <Button type="button" className="w-full">
                {tc("identityYes")}
              </Button>
              <Button type="button" variant="secondary" className="w-full">
                {tc("identityNo")}
              </Button>
            </>
          }
        />
      </ArrivalStage>
    );
  }

  return (
    <ArrivalStage locale={loc}>
      <ArrivalDevStates
        state={state === "guest" ? "guest" : "sent"}
        locale={loc}
        sent={emailSentCopy(t)}
        sessionName="[DEV] Cata de prueba"
        guest={{
          name,
          title: tg("identityTitle", { name }),
          lead: tg("identityLead", { name }),
          continueLabel: tg("identityContinue", { name }),
          notMeLabel: tg("identityNotMe", { name }),
          confirmTitle: tg("identityConfirmTitle"),
          confirmBody: tg("identityConfirmBody", { name }),
          unsyncedTemplate: tg.raw("identityUnsynced") as string,
          confirmButton: tg("identityConfirmButton"),
          cancel: tg("identityCancel"),
          close: tg("identityClose"),
          syncing: tg("identitySyncing"),
          joining: tg("joining"),
        }}
      />
    </ArrivalStage>
  );
}
