import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "./ProfileForm";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const profile = await prisma.profile.findUnique({ where: { id: user.id } });

  const t = await getTranslations("profile");
  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-3xl text-green-dark mb-6">{t("title")}</h1>
      <ProfileForm
        initial={{
          displayName: profile?.displayName ?? "",
          preferredLang: (profile?.preferredLang as "es" | "en") ?? "es",
          bio: profile?.bio ?? "",
        }}
        t={{
          displayName: t("displayName"),
          preferredLang: t("preferredLang"),
          bio: t("bio"),
          save: t("save"),
        }}
      />
    </div>
  );
}
