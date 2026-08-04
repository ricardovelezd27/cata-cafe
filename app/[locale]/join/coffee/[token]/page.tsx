import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { joinCoffeeViaToken } from "@/app/actions/coffees";

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

  const joinAction = joinCoffeeViaToken.bind(null, token, locale);

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
        <form action={joinAction}>
          <button
            type="submit"
            className="w-full py-3 rounded-pill bg-green-dark text-white font-bold hover:bg-green-mid transition"
          >
            {t("share.joinCta")}
          </button>
        </form>
      </div>
    </main>
  );
}
