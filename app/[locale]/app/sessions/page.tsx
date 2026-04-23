import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { DeleteSessionButton } from "./DeleteSessionButton";

const STATUS_COLORS: Record<string, string> = {
  draft: "#C17817",
  active: "#3D5A3E",
  closed: "#8B7355",
};

export default async function SessionsList({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("session");
  const tg = await getTranslations("group");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Own sessions (created by user)
  const ownSessions = user
    ? await prisma.cuppingSession.findMany({
        where: { createdBy: user.id },
        orderBy: { createdAt: "desc" },
        include: {
          samples: { select: { id: true } },
          participants: { select: { userId: true } },
        },
      })
    : [];

  // Joined sessions (participant but not owner)
  const joinedParticipants = user
    ? await prisma.sessionParticipant.findMany({
        where: {
          userId: user.id,
          status: "joined",
        },
        include: {
          session: {
            include: {
              samples: { select: { id: true } },
              participants: { select: { userId: true } },
            },
          },
        },
        orderBy: { joinedAt: "desc" },
      })
    : [];

  const joinedSessions = joinedParticipants.map((p) => p.session);

  function SessionCard({
    s,
    showDelete,
  }: {
    s: (typeof ownSessions)[0];
    showDelete?: boolean;
  }) {
    return (
      <div className="relative bg-[#FDFBF7] border border-brown-light rounded-lg hover:border-green-dark">
        <Link
          href={`/${locale}/app/sessions/${s.id}/cup`}
          className="block px-4 py-3 pr-10"
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
            {new Date(s.date).toLocaleDateString(locale)} · {s.samples.length} muestras ·{" "}
            {s.format}
            {s.isGroup && (
              <span className="ml-2">
                · {s.participants.length} {tg("participants").toLowerCase()}
              </span>
            )}
          </div>
        </Link>
        {showDelete && <DeleteSessionButton sessionId={s.id} locale={locale} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl text-green-dark">{t("list")}</h1>
        <Link
          href={`/${locale}/app/sessions/new`}
          className="px-4 py-2 rounded-lg bg-green-dark text-white text-sm font-bold"
        >
          {t("new")}
        </Link>
      </div>

      {/* Own sessions */}
      <ul className="grid gap-2">
        {ownSessions.map((s) => (
          <li key={s.id}>
            <SessionCard s={s} showDelete />
          </li>
        ))}
      </ul>

      {/* Joined sessions */}
      {joinedSessions.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-xl text-green-dark">{tg("participants")}</h2>
          <ul className="grid gap-2">
            {joinedSessions.map((s) => (
              <li key={s.id}>
                <SessionCard s={s} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
