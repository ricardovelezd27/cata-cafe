"use client";

/**
 * Owner-only cupper alignment panel (N15, Step 4). Shows how closely each
 * cupper's descriptor selections match the group consensus (majority sets),
 * ranked most → least aligned. Informational only — never affects scores.
 * Excluded cuppers are dropped from the consensus (upstream) but still shown,
 * flagged, at the bottom.
 */

export type CupperAlignmentRow = {
  id: string;
  name: string;
  excluded: boolean;
  alignment: number; // 0..1
  matches: number;
  opportunities: number;
};

export type AlignmentTranslations = {
  title: string;
  subtitle: string;
  excluded: string;
  noData: string;
};

export function CupperAlignment({
  rows,
  t,
}: {
  rows: CupperAlignmentRow[];
  t: AlignmentTranslations;
}) {
  const hasData = rows.some((r) => r.opportunities > 0);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #E8E0D0",
        padding: "16px",
      }}
    >
      <div
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 15,
          fontWeight: 700,
          color: "#3D5A3E",
          marginBottom: 4,
        }}
      >
        {t.title}
      </div>
      <div style={{ fontSize: 11, color: "#8B7355", marginBottom: 14, lineHeight: 1.4 }}>
        {t.subtitle}
      </div>

      {!hasData ? (
        <div style={{ fontSize: 12, color: "#C8C0B0", fontStyle: "italic" }}>
          {t.noData}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => {
            const pct = Math.round(r.alignment * 100);
            const barColor = r.excluded
              ? "#C8C0B0"
              : pct >= 75
                ? "#3D5A3E"
                : pct >= 50
                  ? "#C17817"
                  : "#A83232";
            return (
              <div key={r.id}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: r.excluded ? "#B0A48F" : "#5C4A32",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.name}
                    {r.excluded && (
                      <span style={{ color: "#B0A48F", fontWeight: 400 }}> {t.excluded}</span>
                    )}
                  </span>
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 12,
                      fontWeight: 700,
                      color: r.excluded ? "#B0A48F" : "#5C4A32",
                      fontVariantNumeric: "tabular-nums",
                      flexShrink: 0,
                    }}
                  >
                    {r.opportunities > 0 ? `${pct}%` : "—"}
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "#F0EBE0",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${r.opportunities > 0 ? pct : 0}%`,
                      background: barColor,
                      borderRadius: 999,
                      transition: "width 0.3s cubic-bezier(0.2,0.8,0.2,1)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
