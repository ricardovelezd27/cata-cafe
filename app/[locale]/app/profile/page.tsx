import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "./ProfileForm";
import Link from "next/link";
import { signOut, switchAccount } from "@/app/actions/auth";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

function StatusBadge({
  status,
  labels,
}: {
  status: string;
  labels: { draft: string; active: string; closed: string };
}) {
  const cfg = {
    draft: { bg: "#F0EBE0", color: "#8B7355", label: labels.draft },
    active: { bg: "#E8F0E8", color: "#3D5A3E", label: labels.active },
    closed: { bg: "#EBE0E0", color: "#A83232", label: labels.closed },
  }[status] ?? { bg: "#F0EBE0", color: "#8B7355", label: status };

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 10,
        background: cfg.bg,
        color: cfg.color,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {cfg.label}
    </span>
  );
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [profile, ownedSessions, participantRows] = await Promise.all([
    prisma.profile.findUnique({ where: { id: user.id } }),
    prisma.cuppingSession.findMany({
      where: { createdBy: user.id },
      orderBy: { date: "desc" },
      take: 10,
      select: { id: true, name: true, date: true, status: true, format: true, isGroup: true },
    }),
    prisma.sessionParticipant.findMany({
      where: { userId: user.id, status: "joined" },
      include: {
        session: {
          select: { id: true, name: true, date: true, status: true, format: true },
        },
      },
      orderBy: { joinedAt: "desc" },
      take: 10,
    }),
  ]);

  const t = await getTranslations("profile");

  const statusLabels = {
    draft: t("statusDraft"),
    active: t("statusActive"),
    closed: t("statusClosed"),
  };

  const initials = (profile?.displayName || user.email || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const formatDate = (d: Date) =>
    d.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="max-w-xl space-y-8">
      {/* Avatar + identity */}
      <div className="flex items-center gap-4">
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3D5A3E 0%, #2A4430 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFF",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 24,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div>
          <div className="font-serif text-xl text-green-dark font-bold">
            {profile?.displayName || "—"}
          </div>
          <div className="text-sm text-brown-mid">{user.email}</div>
        </div>
      </div>

      {/* Editable profile fields */}
      <div>
        <h2 className="font-serif text-2xl text-green-dark mb-4">{t("title")}</h2>
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

      {/* Owned sessions */}
      <div>
        <h2 className="font-serif text-xl text-green-dark mb-3">{t("ownedSessions")}</h2>
        {ownedSessions.length === 0 ? (
          <p className="text-sm text-brown-mid">{t("noOwnedSessions")}</p>
        ) : (
          <div className="space-y-2">
            {ownedSessions.map((s) => (
              <Link
                key={s.id}
                href={`/${locale}/app/sessions/${s.id}/results`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "#FDFBF7",
                  border: "1px solid #E8E0D0",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#3D5A3E" }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#8B7355", marginTop: 2 }}>
                    {formatDate(s.date)} · {s.format}
                    {s.isGroup && " · Grupal"}
                  </div>
                </div>
                <StatusBadge status={s.status} labels={statusLabels} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Participated sessions */}
      <div>
        <h2 className="font-serif text-xl text-green-dark mb-3">{t("participatedSessions")}</h2>
        {participantRows.length === 0 ? (
          <p className="text-sm text-brown-mid">{t("noParticipatedSessions")}</p>
        ) : (
          <div className="space-y-2">
            {participantRows.map((row) => (
              <Link
                key={row.sessionId}
                href={`/${locale}/app/sessions/${row.sessionId}/results`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "#FDFBF7",
                  border: "1px solid #E8E0D0",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#3D5A3E" }}>
                    {row.session.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#8B7355", marginTop: 2 }}>
                    {formatDate(row.session.date)} · {row.session.format}
                  </div>
                </div>
                <StatusBadge status={row.session.status} labels={statusLabels} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Account actions — reachable on mobile via the "Perfil" tab */}
      <div>
        <h2 className="font-serif text-xl text-green-dark mb-3">{t("account")}</h2>
        <div
          style={{
            padding: "14px",
            background: "#FDFBF7",
            border: "1px solid #E8E0D0",
            borderRadius: 10,
          }}
        >
          <div className="text-sm text-brown-mid mb-3">{user.email}</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <form action={switchAccount.bind(null, locale)}>
              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-[#D4C5A9] text-sm font-semibold text-brown-dark hover:bg-[#EDE8DB] transition-colors"
              >
                {t("switchAccount")}
              </button>
            </form>
            <form action={signOut}>
              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-[#D4C5A9] text-sm font-semibold text-red-defect hover:bg-[#EBE0E0] transition-colors"
              >
                {t("logout")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
