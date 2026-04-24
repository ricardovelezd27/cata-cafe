import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { DevQuickStart } from "./DevQuickStart";

const TEST_USERS = [
  { email: "master@cata.test", label: "Maestro Test",      hint: "owner" },
  { email: "par1@cata.test",   label: "Participante Uno",  hint: "participant" },
  { email: "par2@cata.test",   label: "Participante Dos",  hint: "participant" },
] as const;

export default async function DevPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main
      style={{
        maxWidth: 600,
        margin: "0 auto",
        padding: "32px 20px 64px",
        fontFamily: "monospace",
        color: "#3D2B1A",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#FFF3CD",
          border: "2px solid #FFC107",
          borderRadius: 10,
          padding: "10px 16px",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 20 }}>🛠</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>DEV TOOLS</div>
          <div style={{ fontSize: 11, color: "#856404" }}>Visible solo en development · No existe en producción</div>
        </div>
      </div>

      {/* Current session */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Sesión actual
        </h2>
        <div
          style={{
            background: "#F5F0E6",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          {user ? (
            <>
              <span style={{ color: "#3D5A3E", fontWeight: 700 }}>{user.email}</span>
              {user.email?.endsWith("@cata.test") && (
                <span
                  style={{
                    marginLeft: 8,
                    background: user.email === "master@cata.test" ? "#3D5A3E" : "#7A5C3A",
                    color: "#FFF",
                    borderRadius: 20,
                    padding: "1px 8px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {user.email === "master@cata.test" ? "MAESTRO" : "PARTICIPANTE"}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "#A83232" }}>No conectado</span>
          )}
        </div>
      </section>

      {/* Switch user */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Cambiar usuario de prueba
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TEST_USERS.map((u) => {
            const isActive = user?.email === u.email;
            return (
              <a
                key={u.email}
                href={`/api/dev/sign-in?email=${encodeURIComponent(u.email)}&next=/${locale}/dev`}
                style={{
                  padding: "8px 14px",
                  background: isActive ? "#3D5A3E" : "#E8E0D0",
                  color: isActive ? "#FFF" : "#5C4A32",
                  borderRadius: 8,
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  border: isActive ? "2px solid #2A4430" : "2px solid transparent",
                }}
              >
                {u.label}
                <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>({u.hint})</span>
              </a>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: "#8B7355", marginTop: 8 }}>
          Haz clic para iniciar sesión como ese usuario en esta pestaña.
        </p>
      </section>

      {/* Quick start group session */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 13, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Sesión grupal de prueba
        </h2>
        <DevQuickStart locale={locale} />
      </section>

      {/* Multi-window guide */}
      <section
        style={{
          background: "#F5F0E6",
          borderRadius: 10,
          padding: "14px 18px",
        }}
      >
        <h2 style={{ fontSize: 13, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.8px", marginTop: 0 }}>
          Guía de simulación multi-ventana
        </h2>
        <ol style={{ fontSize: 12, lineHeight: 2, margin: 0, paddingLeft: 20 }}>
          <li>Haz clic en <strong>Maestro Test</strong> arriba para conectarte en esta ventana.</li>
          <li>Haz clic en <strong>Crear sesión de prueba</strong> — aparecen los URLs de participante.</li>
          <li>Copia el URL de <strong>Participante 1</strong> y ábrelo en una ventana incógnito.</li>
          <li>Copia el URL de <strong>Participante 2</strong> y ábrelo en otra ventana incógnito.</li>
          <li>Cada ventana es un usuario distinto en un "ambiente físico" diferente.</li>
          <li>Los participantes evalúan y envían — el contador del Maestro se actualiza en tiempo real.</li>
        </ol>
      </section>
    </main>
  );
}
