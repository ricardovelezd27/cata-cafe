import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const STATUS_COLORS: Record<string, string> = {
  draft: "#C17817",
  active: "#3D5A3E",
  closed: "#8B7355",
};

export default async function Dashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const tg = await getTranslations("group");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sessions = user
    ? await prisma.cuppingSession.findMany({
        where: { createdBy: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          date: true,
          format: true,
          isGroup: true,
          status: true,
          samples: { select: { id: true } },
          participants: { select: { userId: true } },
          _count: {
            select: {
              samples: true,
            },
          },
        },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl text-green-dark">{t("title")}</h1>
        <Link
          href={`/${locale}/app/sessions/new`}
          className="px-4 py-2 rounded-lg bg-green-dark text-white text-sm font-bold"
        >
          {t("newSession")}
        </Link>
      </div>

      <section>
        <h2 className="font-serif text-xl text-green-dark mb-3">{t("recent")}</h2>
        {sessions.length === 0 ? (
          <p className="text-brown-mid text-sm">{t("empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/${locale}/app/sessions/${s.id}/cup`}
                  className="block bg-[#FDFBF7] border border-brown-light rounded-lg px-4 py-3 hover:border-green-dark"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-brown-dark">{s.name}</span>
                    {s.isGroup && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-dark/10 text-green-dark border border-green-dark/20 font-semibold">
                        {tg("toggle")}
                      </span>
                    )}
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold ml-auto"
                      style={{
                        background: `${STATUS_COLORS[s.status] ?? "#8B7355"}18`,
                        color: STATUS_COLORS[s.status] ?? "#8B7355",
                        border: `1px solid ${STATUS_COLORS[s.status] ?? "#8B7355"}40`,
                      }}
                    >
                      {s.status}
                    </span>
                  </div>
                  <div className="text-xs text-brown-mid">
                    {new Date(s.date).toLocaleDateString(locale)} · {s.samples.length}{" "}
                    muestras · {s.format}
                    {s.isGroup && (
                      <span className="ml-2">
                        · {s.participants.length} {tg("participants").toLowerCase()}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
