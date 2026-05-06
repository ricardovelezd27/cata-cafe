"use client";

const COLORS = [
  "#3D5A3E",
  "#6B8F71",
  "#C17817",
  "#8B7355",
  "#9B6B4A",
  "#A83232",
  "#4A90D9",
  "#7B3FA0",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function getAvatarColor(name: string): string {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

export function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  const fontSize = Math.round(size * 0.35);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: getAvatarColor(name),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: "#fff",
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
