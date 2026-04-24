"use server";

import { createClient } from "@/lib/supabase/server";
import { createGroupSession } from "@/app/actions/sessions";
import { prisma } from "@/lib/prisma";

function guardDev() {
  if (process.env.NODE_ENV !== "development") throw new Error("dev_only");
}

export type QuickStartResult =
  | { sessionId: string; inviteToken: string; error?: never }
  | { error: string; sessionId?: never; inviteToken?: never };

export async function devQuickStartSession(
  _prev: unknown,
  _formData: FormData,
): Promise<QuickStartResult> {
  if (process.env.NODE_ENV !== "development") return { error: "dev_only" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email !== "master@cata.test") {
    return { error: "Debes conectarte como Maestro Test primero." };
  }

  try {
    const time = new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    return await createGroupSession({
      name: `[DEV] Sesión de prueba ${time}`,
      date: new Date().toISOString().split("T")[0],
      format: "combined",
      cupsPerSample: 2,
      isAsync: false,
      samples: [{ label: "Muestra A" }, { label: "Muestra B" }],
    });
  } catch {
    return { error: "Error al crear la sesión. Intenta de nuevo." };
  }
}

export async function devDeleteTestSessions(
  _prev: unknown,
  _formData: FormData,
): Promise<{ deleted: number }> {
  guardDev();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email !== "master@cata.test") {
    throw new Error("sign_in_as_master_first");
  }

  const { count } = await prisma.cuppingSession.deleteMany({
    where: {
      createdBy: user.id,
      name: { startsWith: "[DEV]" },
    },
  });

  return { deleted: count ?? 0 };
}
