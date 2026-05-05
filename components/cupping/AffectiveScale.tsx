"use client";

import { AFFECTIVE_LABELS } from "@/lib/constants";

export function AffectiveScale({
  value,
  onChange,
  showFinal,
  finalValue,
  onFinalChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
  showFinal?: boolean;
  finalValue: number | null;
  onFinalChange: (v: number) => void;
}) {
  const effectiveFinal = finalValue || value;
  const hasChanged = !!(finalValue && value && finalValue !== value);

  const handleClick = (n: number) => {
    if (!value) {
      onChange(n);
      onFinalChange(n);
    } else {
      onFinalChange(n);
    }
  };

  const arrowMin = value && finalValue ? Math.min(value, finalValue) : null;
  const arrowMax = value && finalValue ? Math.max(value, finalValue) : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const isFirst = value === n;
          const isFinal = effectiveFinal === n;
          const isBetween =
            hasChanged && arrowMin && arrowMax && n > arrowMin && n < arrowMax;

          let btnStyle: React.CSSProperties;
          if (isFinal) {
            btnStyle = { background: "#3D5A3E", color: "#FFF", border: "2px solid transparent", fontWeight: 700 };
          } else if (isFirst) {
            btnStyle = { background: "transparent", color: "#C17817", border: "2px solid #C17817", fontWeight: 700 };
          } else if (isBetween) {
            btnStyle = { background: "#F0EBE0", color: "#8B7355", border: "2px solid transparent", fontWeight: 400 };
          } else {
            btnStyle = { background: "#E8E0D0", color: "#5C4A32", border: "2px solid transparent", fontWeight: 400 };
          }

          return (
            <button
              key={n}
              onClick={() => handleClick(n)}
              style={{
                flex: 1,
                height: 34,
                borderRadius: 6,
                fontSize: 14,
                cursor: "pointer",
                position: "relative",
                fontFamily: "inherit",
                transition: "all 0.15s",
                ...btnStyle,
              }}
            >
              {n}
              {isBetween && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 2,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "#C4A882",
                    display: "block",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {value && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "2px 4px",
            minHeight: 20,
          }}
        >
          {hasChanged ? (
            <div style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
              <span style={{ color: "#C17817" }}>
                {value}{" "}
                <span style={{ fontSize: 9 }}>({AFFECTIVE_LABELS[value]})</span>
              </span>
              <span style={{ color: "#8B7355", fontSize: 13 }}>→</span>
              <span style={{ color: "#3D5A3E", fontWeight: 700 }}>
                {effectiveFinal}{" "}
                <span style={{ fontSize: 9 }}>
                  ({AFFECTIVE_LABELS[effectiveFinal as number]})
                </span>
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#3D5A3E", fontStyle: "italic", textAlign: "center", width: "100%" }}>
              {AFFECTIVE_LABELS[value]}
            </div>
          )}
        </div>
      )}

      {showFinal && effectiveFinal && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 4,
            padding: 6,
            background: "#E8F0E8",
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: "#8B7355", letterSpacing: "1px" }}>
            FINAL
          </span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#3D5A3E",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
            }}
          >
            {effectiveFinal}
          </span>
        </div>
      )}
    </div>
  );
}
