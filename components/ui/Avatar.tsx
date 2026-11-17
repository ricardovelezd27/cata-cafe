"use client";

/**
 * A person's avatar (DESIGN.md, "Colours for people, processes and formats"):
 * a neutral circle (`surface-container-high`) with the initials in ink, and a
 * ring in one of the nine family tones. The tone is picked by a stable hash of
 * the person's id (`seed`; the name when no id is given), so a person keeps
 * their tone everywhere. The tone is the ring, never the text or its ground.
 */
const RING_TONES = [
  "--color-flavor-floral",
  "--color-flavor-fruity",
  "--color-flavor-sweet",
  "--color-flavor-sour",
  "--color-flavor-green",
  "--color-flavor-nutty",
  "--color-flavor-spice",
  "--color-flavor-roasted",
  "--color-flavor-other",
] as const;

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** The ring's tone token for a seed: a stable hash, the same on every screen. */
export function avatarTone(seed: string): (typeof RING_TONES)[number] {
  const hash = seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return RING_TONES[hash % RING_TONES.length];
}

export function Avatar({ name, seed, size = 64 }: { name: string; seed?: string; size?: number }) {
  const fontSize = Math.round(size * 0.35);
  const ring = Math.max(2, Math.round(size * 0.05));
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "var(--color-surface-container-high)",
        // An inset ring keeps the avatar's size exactly as it was.
        boxShadow: `inset 0 0 0 ${ring}px var(${avatarTone(seed ?? name)})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: "var(--color-on-surface)",
          fontSize,
          fontWeight: 700,
          fontFamily: "Inter, sans-serif",
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        {getInitials(name)}
      </span>
    </div>
  );
}
