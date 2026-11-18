import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isRegisteredUser } from "@/lib/guestScope";
import { JoinCoffeeForm } from "@/components/join/JoinCoffeeForm";
import { ArrivalCard } from "@/components/arrival/ArrivalCard";
import { ArrivalStage } from "@/components/arrival/ArrivalStage";
import { ButtonLink } from "@/components/ui";

// Auth'd page with an extra dynamic [token] segment: must render per-request
// (see the documented production outage for groups/[id] and coffees/[id]).
// No generateStaticParams here.
export const dynamic = "force-dynamic";

export default async function JoinCoffeePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getTranslations("coffee");
  const tErrors = await getTranslations("errors");
  const tAuth = await getTranslations("auth");

  const invite = await prisma.coffeeInvite.findUnique({
    where: { token },
    include: { coffee: { select: { id: true, name: true, visibility: true } } },
  });

  const isValid =
    invite &&
    invite.coffee.visibility !== "private" &&
    (!invite.expiresAt || invite.expiresAt > new Date()) &&
    (invite.maxUses === null || invite.useCount < invite.maxUses);

  if (!isValid) {
    return (
      <ArrivalStage locale={locale}>
        <ArrivalCard
          tone="warning"
          title={t("share.invalidToken")}
          actions={
            <>
              <ButtonLink href={user ? `/${locale}/app` : `/${locale}/auth/login`} className="w-full">
                {user ? tErrors("home") : tAuth("loginTitle")}
              </ButtonLink>
              <ButtonLink href={user ? `/${locale}/auth/login` : `/${locale}/app`} variant="secondary" className="w-full">
                {user ? tAuth("loginTitle") : tErrors("home")}
              </ButtonLink>
            </>
          }
        />
      </ArrivalStage>
    );
  }

  // An anonymous QR guest is treated like a signed-out visitor: coffee links
  // need a real account (S8-03).
  if (!isRegisteredUser(user)) {
    const loginHref = `/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/join/coffee/${token}`)}`;
    return (
      <ArrivalStage locale={locale}>
        <ArrivalCard
          title={invite.coffee.name}
          lead={t("share.joinTitle")}
          actions={
            <ButtonLink href={loginHref} className="w-full">
              {t("share.joinLogin")}
            </ButtonLink>
          }
        />
      </ArrivalStage>
    );
  }

  const errorCodes = tErrors.raw("codes") as Record<string, string>;

  return (
    <ArrivalStage locale={locale}>
      <ArrivalCard title={invite.coffee.name} lead={t("share.joinBody", { name: invite.coffee.name })}>
        <JoinCoffeeForm
          token={token}
          locale={locale}
          translations={{
            button: t("share.joinCta"),
            pending: t("share.joinCta"),
            errors: errorCodes,
            home: tErrors("home"),
          }}
        />
      </ArrivalCard>
    </ArrivalStage>
  );
}
