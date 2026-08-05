import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { locale } = await params;
  const { next, email } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-[#FDFBF7] border border-brown-light rounded-card p-8 space-y-5">
        <h1 className="text-3xl text-green-dark font-serif font-semibold">{t("loginTitle")}</h1>
        <LoginForm
          emailLabel={t("email")}
          sendLabel={t("sendLink")}
          sendingLabel={t("sending")}
          sentLabel={t("sent")}
          errorLabel={t("error")}
          rateLimitErrorLabel={t("rateLimitError")}
          googleLabel={t("signInWithGoogle")}
          orLabel={t("or")}
          subtitleLabel={t("loginSubtitle")}
          next={next}
          initialEmail={email}
        />
      </div>
    </main>
  );
}
