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
    select: { id: true, name: true, startedAt: true, createdBy: true },
  });

  if (!session) notFound();

  // Owner should never be in the waiting room
  if (session.createdBy === user.id) {
    redirect(`/${locale}/app/sessions/${id}/cup`);
  }

  // If already started, go straight to cup
  if (session.startedAt) {
    redirect(`/${locale}/app/sessions/${id}/cup`);
  }

  return (
    <WaitingRoomClient
      sessionId={session.id}
      sessionName={session.name}
      locale={locale}
      translations={{
        title: "Bienvenido a la sesión",
        subtitle: session.name,
        description:
          "El maestro de cata está preparando todo. La sesión comenzará en breve. Por favor, espera aquí.",
        waiting: "Esperando al maestro",
      }}
    />
  );
}
