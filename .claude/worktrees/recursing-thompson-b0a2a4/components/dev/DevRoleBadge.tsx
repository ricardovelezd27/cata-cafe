"use client";

const CONFIG: Record<string, { label: string; bg: string }> = {
  "master@cata.test": { label: "DEV · Maestro",        bg: "#3D5A3E" },
  "par1@cata.test":   { label: "DEV · Participante 1", bg: "#7A5C3A" },
  "par2@cata.test":   { label: "DEV · Participante 2", bg: "#6B4226" },
};

export function DevRoleBadge({ email }: { email?: string }) {
  if (process.env.NODE_ENV !== "development") return null;
  if (!email?.endsWith("@cata.test")) return null;

  const cfg = CONFIG[email] ?? { label: `DEV · ${email}`, bg: "#555" };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 76,
        left: 10,
        zIndex: 9999,
        background: cfg.bg,
        color: "#FFF",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.5px",
        fontFamily: "monospace",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {cfg.label}
    </div>
  );
}
