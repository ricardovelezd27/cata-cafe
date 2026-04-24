import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { joinViaToken } from "@/app/actions/community";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  // Auth check — redirect to login with next param if unauthenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/join/${token}`)}`);
  }

  const t = await getTranslations("group");

  // Validate invite token
  const invite = await prisma.sessionInvite.findUnique({
    where: { token },
    include: { session: { select: { id: true, name: true } } },
  });

  const isValid =
    invite &&
    (!invite.expiresAt || invite.expiresAt > new Date()) &&
    (invite.maxUses === null || invite.useCount < invite.maxUses);

  if (!isValid) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-2xl p-8 text-center space-y-4">
          <p className="text-lg font-semibold text-red-defect">{t("invalidToken")}</p>
        </div>
      </main>
    );
  }

  // Bind locale into the server action
  const joinAction = joinViaToken.bind(null, token, locale);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-2xl p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-serif text-green-dark font-semibold">
            {invite.session.name}
          </h1>
          <p className="text-sm text-brown-mid mt-1">{t("joinSession")}</p>
        </div>
        <form action={joinAction}>
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-green-dark text-white font-bold hover:bg-green-mid transition"
          >
            {t("joinSession")}
          </button>
        </form>
      </div>
    </main>
  );
}
