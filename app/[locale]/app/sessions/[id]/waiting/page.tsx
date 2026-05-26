import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { WaitingRoomClient } from "./WaitingRoomClient";

export const dynamic = "force-dynamic";

export default async function WaitingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const session = await prisma.cuppingSession.findFirst({
    where: {
      id,
      participants: { some: { userId: user.id } },
    },
    select: { id: true, name: true, startedAt: true, createdBy: true, date: true, isAsync: true },
  });

  if (!session) notFound();

  // Owner should never be in the waiting room
  if (session.createdBy === user.id) {
    redirect(`/${locale}/app/sessions/${id}/cup`);
  }

  const today = new Date();
  const sessionDay = new Date(session.date);
  const isAsyncMode =
    session.isAsync ||
    sessionDay.toDateString() !== today.toDateString();

  // If already started (live session), go straight to cup
  if (!isAsyncMode && session.startedAt) {
    redirect(`/${locale}/app/sessions/${id}/cup`);
  }

  return (
    <WaitingRoomClient
      sessionId={session.id}
      sessionName={session.name}
      locale={locale}
      isAsync={isAsyncMode}
      translations={{
        title: isAsyncMode ? "Tu cata está lista" : "Bienvenido a la sesión",
        description: isAsyncMode
          ? "Esta es una cata asíncrona. Puedes evaluar los cafés a tu propio ritmo — no necesitas esperar al maestro de cata."
          : "El maestro de cata está preparando la sala. La cata comenzará cuando el maestro dé la señal. Por favor, espera aquí.",
        asyncDetail:
          "Tu evaluación quedará registrada en el perfil de cada café y sumará a la puntuación comunitaria de esta sesión.",
        waiting: "Esperando al maestro",
        buttonLabel: "Iniciar cata",
        checkingLabel: "Verificando...",
        notStartedMsg: "Aún no ha comenzado",
      }}
    />
  );
}
