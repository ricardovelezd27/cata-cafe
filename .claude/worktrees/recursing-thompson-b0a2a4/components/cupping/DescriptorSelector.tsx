"use client";

type Descriptor = { id: string; label: string; subs?: readonly string[] };

export function DescriptorSelector({
  descriptors,
  selected,
  onChange,
  hasSubs,
}: {
  descriptors: readonly Descriptor[];
  selected: string[];
  onChange: (v: string[]) => void;
  hasSubs?: boolean;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {descriptors.map((d) => {
        const isActive = selected.includes(d.id);
        return (
          <div key={d.id}>
            <button
              onClick={() => toggle(d.id)}
              style={{
                padding: "4px 10px",
                borderRadius: 12,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                border: isActive ? "1px solid #3D5A3E" : "1px solid #D4C5A9",
                background: isActive ? "#3D5A3E" : "transparent",
                color: isActive ? "#FFF" : "#8B7355",
              }}
            >
              {d.label}
            </button>
            {isActive && hasSubs && d.subs && d.subs.length > 0 && (
              <div style={{ fontSize: 10, color: "#8B7355", marginLeft: 12, marginTop: 2 }}>
                ({d.subs.join(", ")})
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
