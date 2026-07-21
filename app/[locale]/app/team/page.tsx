import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui/Avatar";
import { getCoCupperCandidates, type CoCupperCandidate } from "@/lib/coCuppers";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months === 1) return "hace 1 mes";
  if (months < 12) return `hace ${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? "hace 1 año" : `hace ${years} años`;
}

const ROLE_LABELS: Record<string, string> = {
  cupping_pro: "Catador Pro",
  q_grader: "Q Grader",
  barista: "Barista",
  roaster: "Tostador",
  producer: "Productor",
};

function CupperCard({ cupper, locale }: { cupper: CoCupperCandidate; locale: string }) {
  const roleLabel = ROLE_LABELS[cupper.role] ?? cupper.role;
  return (
    <div className="group bg-white rounded-xl border border-[#E8E0D0] p-5 flex flex-col gap-4 transition-all hover:shadow-md hover:border-[#6B8F71]">
      <div className="flex items-center gap-4">
        <Avatar name={cupper.displayName} size={56} />
        <div className="min-w-0">
          <p className="font-semibold text-[15px] text-brown-dark truncate">
            {cupper.displayName}
          </p>
          <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-[#F0EBE1] text-brown-mid">
            {roleLabel}
          </span>
        </div>
      </div>

      <hr className="border-[#E8E0D0]" />

      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-brown-dark">
          <span className="font-semibold">{cupper.sessionCount}</span>{" "}
          {cupper.sessionCount === 1 ? "sesión" : "sesiones"}{" "}
          ·{" "}
          <span className="font-semibold">{cupper.evaluationCount}</span>{" "}
          {cupper.evaluationCount === 1 ? "cata" : "catas"}
        </p>
        <p className="text-xs text-brown-mid">
          Última sesión: {formatRelativeDate(cupper.lastSessionDate)} —{" "}
          <span className="italic">{cupper.lastSessionName}</span>
        </p>
      </div>

      <Link
        href={`/${locale}/app/profile/history`}
        className="text-xs text-[#3D5A3E] font-medium hover:underline self-start"
      >
        Ver historial →
      </Link>
    </div>
  );
}

export default async function TeamPage({
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

  // Distinct group session count for the header stat (same session-id union
  // getCoCupperCandidates uses internally, kept here since it's a header-only
  // metric and not part of the per-cupper array it returns).
  const [asParticipant, asCreator] = await Promise.all([
    prisma.sessionParticipant.findMany({
      where: { userId: user.id },
      select: { sessionId: true },
    }),
    prisma.cuppingSession.findMany({
      where: { createdBy: user.id, isGroup: true },
      select: { id: true },
    }),
  ]);

  const sessionIds = [
    ...new Set([
      ...asParticipant.map((p) => p.sessionId),
      ...asCreator.map((s) => s.id),
    ]),
  ];

  const cuppers = await getCoCupperCandidates(user.id);

  const totalEvals = cuppers.reduce((sum, c) => sum + c.evaluationCount, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl text-green-dark font-semibold">
          Catadores
        </h1>
        <p className="text-sm text-brown-mid mt-1">Tu red de catadores CVA</p>
        {cuppers.length > 0 && (
          <p className="text-xs text-brown-mid mt-2">
            {cuppers.length} {cuppers.length === 1 ? "catador" : "catadores"}{" "}
            · {sessionIds.length}{" "}
            {sessionIds.length === 1 ? "sesión grupal" : "sesiones grupales"}{" "}
            · {totalEvals} {totalEvals === 1 ? "evaluación comunitaria" : "evaluaciones comunitarias"}
          </p>
        )}
      </div>

      {/* Empty state */}
      {cuppers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <span className="text-5xl">☕</span>
          <p className="text-brown-dark font-medium">
            Aún no has catado con nadie
          </p>
          <p className="text-sm text-brown-mid max-w-xs">
            Crea una sesión grupal e invita a otros catadores para empezar a construir tu red.
          </p>
          <Link
            href={`/${locale}/app/sessions/new`}
            className="mt-2 px-4 py-2 rounded-lg bg-green-dark text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Crear sesión grupal →
          </Link>
        </div>
      )}

      {/* Cards grid */}
      {cuppers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cuppers.map((c) => (
            <CupperCard key={c.userId} cupper={c} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
