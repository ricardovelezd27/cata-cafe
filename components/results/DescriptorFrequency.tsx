"use client";

export type SampleDescriptorFreq = {
  sampleId: string;
  label: string;
  totalEvaluators: number;
  descriptors: { id: string; label: string; color: string; count: number }[];
};

export function DescriptorFrequency({
  samples,
  locale,
}: {
  samples: SampleDescriptorFreq[];
  locale: string;
}) {
  const es = locale === "es";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {samples.map((sample) => {
        const maxCount =
          sample.descriptors.length > 0
            ? Math.max(...sample.descriptors.map((d) => d.count))
            : 0;

        return (
          <div
            key={sample.sampleId}
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #E8E0D0",
              padding: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#3D5A3E",
                }}
              >
                {sample.label}
              </div>
              {sample.totalEvaluators > 0 && (
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "#8B7355",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sample.totalEvaluators}{" "}
                  {es
                    ? sample.totalEvaluators === 1
                      ? "catador"
                      : "catadores"
                    : sample.totalEvaluators === 1
                      ? "participant"
                      : "participants"}
                </div>
              )}
            </div>

            {sample.descriptors.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "#8B7355",
                  fontStyle: "italic",
                  padding: "8px 0",
                }}
              >
                {es
                  ? "Ningún descriptor fue seleccionado por 2 o más catadores."
                  : "No descriptor was selected by 2 or more participants."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sample.descriptors.map((d) => {
                  const pct =
                    maxCount > 0 ? Math.max(6, (d.count / maxCount) * 100) : 0;
                  return (
                    <div key={d.id}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          gap: 8,
                          marginBottom: 3,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#5C4A32",
                            fontFamily: "var(--font-ui)",
                          }}
                        >
                          {d.label}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontFamily: "var(--font-mono)",
                            color: d.color,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {d.count} {es ? "de" : "of"} {sample.totalEvaluators}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 12,
                          borderRadius: 6,
                          background: "#F2EDE3",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            borderRadius: 6,
                            background: d.color,
                            transition: "width 0.3s ease",
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
      })}
    </div>
  );
}
