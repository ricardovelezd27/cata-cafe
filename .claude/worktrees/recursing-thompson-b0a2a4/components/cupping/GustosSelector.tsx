"use client";

import { GUSTOS_PREDOMINANTES } from "@/lib/constants";

export function GustosSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (g: string) => {
    if (selected.includes(g)) onChange(selected.filter((x) => x !== g));
    else if (selected.length < 2) onChange([...selected, g]);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {GUSTOS_PREDOMINANTES.map((g) => {
        const isActive = selected.includes(g);
        return (
          <button
            key={g}
            onClick={() => toggle(g)}
            style={{
              padding: "5px 12px",
              borderRadius: 14,
              border: isActive ? "2px solid #3D5A3E" : "2px solid #D4C5A9",
              background: isActive ? "#3D5A3E" : "transparent",
              color: isActive ? "#FFF" : "#5C4A32",
              fontSize: 12,
              fontWeight: isActive ? 700 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {g}
          </button>
        );
      })}
      <span style={{ fontSize: 10, color: "#8B7355", alignSelf: "center" }}>(máx. 2)</span>
    </div>
  );
}
