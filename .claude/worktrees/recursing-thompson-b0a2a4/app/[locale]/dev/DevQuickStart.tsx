"use client";

import { useActionState } from "react";
import { devQuickStartSession, devDeleteTestSessions } from "@/app/actions/dev";
import type { QuickStartResult } from "@/app/actions/dev";

type SessionResult = QuickStartResult | null;
type DeleteResult = { deleted: number } | null;

function joinUrl(origin: string, locale: string, token: string, email: string) {
  const next = encodeURIComponent(`/${locale}/join/${token}`);
  return `${origin}/api/dev/sign-in?email=${encodeURIComponent(email)}&next=${next}`;
}

export function DevQuickStart({ locale }: { locale: string }) {
  const [session, startAction, isPending] = useActionState<SessionResult, FormData>(
    devQuickStartSession,
    null,
  );
  const [deleteResult, deleteAction, isDeleting] = useActionState<DeleteResult, FormData>(
    devDeleteTestSessions,
    null,
  );

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div>
      {!session || session.error ? (
        <form action={startAction}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              padding: "8px 18px",
              background: isPending ? "#C4B49A" : "#3D5A3E",
              color: "#FFF",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: isPending ? "default" : "pointer",
              fontFamily: "monospace",
            }}
          >
            {isPending ? "Creando..." : "Crear sesión de prueba"}
          </button>
          {session?.error ? (
            <p style={{ fontSize: 12, color: "#A83232", marginTop: 6, fontWeight: 600 }}>
              ⚠ {session.error}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: "#8B7355", marginTop: 6 }}>
              Debes estar conectado como <code>master@cata.test</code>
            </p>
          )}
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "#E8F0E8", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#3D5A3E", marginBottom: 4 }}>
              SESIÓN CREADA
            </div>
            <a
              href={`/${locale}/app/sessions/${session.sessionId!}/cup`}
              style={{ fontSize: 12, color: "#3D5A3E", fontFamily: "monospace" }}
            >
              → Abrir como Maestro
            </a>
          </div>

          <div style={{ background: "#F5EFE4", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7A5C3A", marginBottom: 6 }}>
              PARTICIPANTES — abrir en ventanas incógnito
            </div>
            {[
              { email: "par1@cata.test", label: "Participante 1" },
              { email: "par2@cata.test", label: "Participante 2" },
            ].map(({ email, label }) => (
              <div key={email} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "#5C4A32", marginBottom: 2 }}>{label}</div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    background: "#FFF",
                    border: "1px solid #D4C5A9",
                    borderRadius: 6,
                    padding: "4px 8px",
                  }}
                >
                  <code style={{ fontSize: 10, flex: 1, wordBreak: "break-all", color: "#5C4A32" }}>
                    {joinUrl(origin, locale, session.inviteToken!, email)}
                  </code>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(joinUrl(origin, locale, session.inviteToken!, email))
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                    title="Copiar"
                  >
                    📋
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cleanup */}
      <div style={{ marginTop: 20, borderTop: "1px solid #E8E0D0", paddingTop: 16 }}>
        <form action={deleteAction}>
          <button
            type="submit"
            disabled={isDeleting}
            style={{
              padding: "6px 14px",
              background: "transparent",
              color: "#A83232",
              border: "1px solid #A83232",
              borderRadius: 8,
              fontSize: 12,
              cursor: isDeleting ? "default" : "pointer",
              fontFamily: "monospace",
            }}
          >
            {isDeleting ? "Eliminando..." : "Eliminar sesiones [DEV]"}
          </button>
          {deleteResult && (
            <span style={{ fontSize: 12, color: "#5C4A32", marginLeft: 10 }}>
              {deleteResult.deleted} sesiones eliminadas
            </span>
          )}
        </form>
      </div>
    </div>
  );
}
