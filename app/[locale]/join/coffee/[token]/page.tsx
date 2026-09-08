import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { JoinCoffeeForm } from "@/components/join/JoinCoffeeForm";

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
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 text-center space-y-4">
          <p className="text-lg font-semibold text-red-defect">{t("share.invalidToken")}</p>
          <div className="flex flex-col gap-2 text-sm">
            <Link href={`/${locale}/app`} className="text-brown-mid underline hover:text-green-dark">
              {tErrors("home")}
            </Link>
            <Link
              href={`/${locale}/auth/login`}
              className="text-brown-mid underline hover:text-green-dark"
            >
              {tAuth("loginTitle")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    const loginHref = `/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/join/coffee/${token}`)}`;
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-serif text-green-dark font-semibold">
              {invite.coffee.name}
            </h1>
            <p className="text-sm text-brown-mid mt-1">{t("share.joinTitle")}</p>
          </div>
          <Link
            href={loginHref}
            className="block w-full text-center py-3 rounded-pill bg-green-dark text-white font-bold hover:bg-green-mid transition"
          >
            {t("share.joinLogin")}
          </Link>
        </div>
      </main>
    );
  }

  const errorCodes = tErrors.raw("codes") as Record<string, string>;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-green-dark font-semibold">
            {invite.coffee.name}
          </h1>
          <p className="text-sm text-brown-mid mt-1">
            {t("share.joinBody", { name: invite.coffee.name })}
          </p>
        </div>
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
      </div>
    </main>
  );
}
