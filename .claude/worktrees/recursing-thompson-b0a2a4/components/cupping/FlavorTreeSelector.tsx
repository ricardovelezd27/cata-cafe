"use client";

import { FLAVOR_TREE } from "@/lib/constants";

export function FlavorTreeSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {FLAVOR_TREE.map((cat) => {
        const isActive = selected.includes(cat.id);
        const hasActiveSubs = cat.subs.some((s) => selected.includes(s.id));
        return (
          <div key={cat.id} style={{ marginBottom: 2 }}>
            <button
              onClick={() => toggle(cat.id)}
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
              {cat.label}
            </button>
            {(isActive || hasActiveSubs) && cat.subs.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3, marginLeft: 12 }}>
                {cat.subs.map((sub) => {
                  const subActive = selected.includes(sub.id);
                  return (
                    <button
                      key={sub.id}
                      onClick={() => toggle(sub.id)}
                      style={{
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        border: subActive ? "1px solid #6B8F71" : "1px solid #D4C5A9",
                        background: subActive ? "#6B8F71" : "transparent",
                        color: subActive ? "#FFF" : "#8B7355",
                      }}
                    >
                      {sub.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
