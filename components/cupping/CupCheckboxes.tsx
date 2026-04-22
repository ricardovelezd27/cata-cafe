"use client";

export function CupCheckboxes({
  count,
  checked,
  onChange,
  label,
  color,
}: {
  count: number;
  checked: boolean[];
  onChange: (v: boolean[]) => void;
  label: string;
  color: string;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#8B7355",
          letterSpacing: "0.5px",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            onClick={() => {
              const next = [...checked];
              next[i] = !next[i];
              onChange(next);
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `2px solid ${checked[i] ? color : "#D4C5A9"}`,
              background: checked[i] ? color : "transparent",
              color: checked[i] ? "#FFF" : "#8B7355",
              fontFamily: "inherit",
            }}
          >
            {checked[i] ? "✗" : i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
