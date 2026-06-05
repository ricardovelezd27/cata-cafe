"use client";

import {
  AFFECTIVE_ATTRIBUTES,
  FLAVOR_FAMILIES,
  MOUTHFEEL_OPTIONS,
  MAIN_TASTES,
  SENSORY_DEFECT_LABELS,
  type SensoryDefect,
} from "@/lib/constants";
import { calcIndividualScore, calcAffectiveSum } from "@/lib/scoring";

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  ink: "#1a1a1a",
  inkSoft: "#4a4a4a",
  muted: "#8a8a8a",
  rule: "#222",
  ruleSoft: "#bdbdbd",
  hairline: "#e2e2e2",
  cream: "#FBF8F1",
  green: "#3D5A3E",
  red: "#A83232",
  white: "#FFF",
};

// ─── Global CSS (print + on-screen A4 simulation) ───────────────────────────
const PRINT_STYLE = `
  @page { size: A4; margin: 0; }

  @media print {
    html, body {
      background: white !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .no-print, .mobile-print-overlay { display: none !important; }
    .sca-shell { background: white !important; padding: 0 !important; }
    .sca-page {
      box-shadow: none !important;
      margin: 0 !important;
      page-break-after: always;
      break-after: page;
    }
    .sca-page:last-child { page-break-after: auto; break-after: auto; }
  }

  /* On-screen A4 simulation */
  .sca-page {
    width: 210mm;
    min-height: 297mm;
    background: white;
    box-shadow: 0 4px 14px rgba(0,0,0,0.10);
    margin: 0 auto 14mm auto;
    padding: 12mm 14mm;
    box-sizing: border-box;
    color: ${C.ink};
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 9.5pt;
    line-height: 1.28;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sca-page * { box-sizing: border-box; }

  /* Combined sheet rotates to landscape so two columns fit */
  .sca-page.landscape {
    width: 297mm;
    min-height: 210mm;
    padding: 10mm 12mm;
  }
  @media print {
    .sca-page.landscape { page: landscape; }
    @page landscape { size: A4 landscape; margin: 0; }
  }

  @media screen and (max-width: 767px) {
    .sca-page { display: none !important; }
    .mobile-print-overlay { display: flex !important; }
  }
  @media screen and (min-width: 768px) {
    .mobile-print-overlay { display: none !important; }
  }
`;

// ─── Types ──────────────────────────────────────────────────────────────────
type D = Record<string, unknown>;
type SampleData = {
  id: string;
  label: string;
  coffeeName: string | null;
  descriptive: D;
  affective: D;
  combined: D;
  physical: D;
  extrinsic: D;
};

// ─── Tiny utilities ─────────────────────────────────────────────────────────
const num = (d: D, k: string): number | null => {
  const v = d[k];
  return typeof v === "number" ? v : null;
};
const str = (d: D, k: string): string => (typeof d[k] === "string" ? (d[k] as string) : "");
const arr = (d: D, k: string): string[] => (Array.isArray(d[k]) ? (d[k] as string[]) : []);
const bools = (d: D, k: string, n: number): boolean[] => {
  const v = d[k];
  if (Array.isArray(v)) return Array.from({ length: n }, (_, i) => v[i] === true);
  return Array.from({ length: n }, () => false);
};

// ─── Primitives ─────────────────────────────────────────────────────────────

function Box({
  letter,
  title,
  hint,
  children,
  style,
}: {
  letter?: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        border: `1px solid ${C.rule}`,
        ...style,
      }}
    >
      <div
        style={{
          borderBottom: `1px solid ${C.rule}`,
          padding: "2px 6px",
          fontSize: 7.5,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: C.cream,
        }}
      >
        <span>
          {letter && (
            <span
              style={{
                display: "inline-block",
                background: C.ink,
                color: C.white,
                fontSize: 7,
                width: 12,
                height: 12,
                lineHeight: "12px",
                textAlign: "center",
                marginRight: 5,
                borderRadius: 2,
              }}
            >
              {letter}
            </span>
          )}
          {title}
        </span>
        {hint && (
          <span style={{ fontSize: 6.5, fontWeight: 400, color: C.inkSoft, letterSpacing: 0.4 }}>
            {hint}
          </span>
        )}
      </div>
      <div style={{ padding: "5px 6px" }}>{children}</div>
    </div>
  );
}

function Tick({ checked, color = C.ink, size = 8.5 }: { checked: boolean; color?: string; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `1px solid ${color}`,
        background: checked ? color : C.white,
        position: "relative",
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    >
      {checked && (
        <span
          style={{
            position: "absolute",
            top: -1,
            left: 1,
            color: C.white,
            fontSize: size - 2,
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          ✓
        </span>
      )}
    </span>
  );
}

function IntensityScale({ value, height = 18 }: { value: number | null; height?: number }) {
  // 0–15 horizontal ruler with tick marks every unit, larger ticks at 0/5/10/15
  return (
    <div style={{ position: "relative", height, paddingTop: 4 }}>
      {/* axis line */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: height / 2,
          height: 1,
          background: C.rule,
        }}
      />
      {/* ticks 0..15 */}
      {Array.from({ length: 16 }, (_, i) => {
        const major = i % 5 === 0;
        const tickH = major ? 8 : 4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${(i / 15) * 100}%`,
              top: height / 2 - tickH / 2,
              width: 1,
              height: tickH,
              background: C.rule,
              transform: "translateX(-0.5px)",
            }}
          />
        );
      })}
      {/* labels */}
      {[0, 5, 10, 15].map((m) => (
        <div
          key={m}
          style={{
            position: "absolute",
            left: `${(m / 15) * 100}%`,
            top: height / 2 + 5,
            transform: "translateX(-50%)",
            fontSize: 6.5,
            color: C.inkSoft,
          }}
        >
          {m}
        </div>
      ))}
      {/* L / M / H bands */}
      <div
        style={{
          position: "absolute",
          left: "8%",
          top: -1,
          fontSize: 6.5,
          letterSpacing: 1,
          color: C.muted,
        }}
      >
        LOW
      </div>
      <div
        style={{
          position: "absolute",
          left: "45%",
          top: -1,
          fontSize: 6.5,
          letterSpacing: 1,
          color: C.muted,
        }}
      >
        MEDIUM
      </div>
      <div
        style={{
          position: "absolute",
          right: "5%",
          top: -1,
          fontSize: 6.5,
          letterSpacing: 1,
          color: C.muted,
        }}
      >
        HIGH
      </div>
      {/* marker */}
      {value !== null && (
        <div
          style={{
            position: "absolute",
            left: `${(Math.max(0, Math.min(15, value)) / 15) * 100}%`,
            top: height / 2 - 9,
            transform: "translateX(-50%)",
            color: C.green,
            fontSize: 12,
            fontWeight: 900,
            lineHeight: 1,
          }}
          aria-hidden
        >
          ▼
        </div>
      )}
    </div>
  );
}

function NotesLine({ value, lines = 2 }: { value: string; lines?: number }) {
  // dotted/underlined lines printed; if value present overlay text
  return (
    <div style={{ position: "relative", marginTop: 2 }}>
      {value ? (
        <div style={{ fontSize: 8, color: C.ink, fontStyle: "italic", whiteSpace: "pre-wrap" }}>
          {value}
        </div>
      ) : (
        Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            style={{
              borderBottom: `1px dotted ${C.ruleSoft}`,
              height: 11,
            }}
          />
        ))
      )}
    </div>
  );
}

// ─── Flavor CATA (Boxes A & B) ──────────────────────────────────────────────

const FLAT_FLAVOR: { id: string; label: string; indent: boolean }[] = (() => {
  const out: { id: string; label: string; indent: boolean }[] = [];
  for (const fam of FLAVOR_FAMILIES) {
    out.push({ id: fam.id, label: fam.label, indent: false });
    for (const sub of fam.subItems) out.push({ id: sub.id, label: sub.label, indent: true });
  }
  return out;
})();

function FlavorCATA({ selected }: { selected: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        rowGap: 1,
        columnGap: 6,
        fontSize: 7.5,
        color: C.ink,
      }}
    >
      {FLAT_FLAVOR.map((opt) => {
        const on = selected.includes(opt.id);
        return (
          <div
            key={opt.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              paddingLeft: opt.indent ? 10 : 0,
              fontWeight: on ? 700 : 400,
            }}
          >
            <Tick checked={on} size={7.5} />
            <span style={{ lineHeight: 1.2 }}>{opt.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MainTastesCATA({ selected }: { selected: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 7.5 }}>
      {MAIN_TASTES.map((t) => {
        const on = selected.includes(t.id);
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: on ? 700 : 400 }}>
            <Tick checked={on} size={7.5} />
            <span>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MouthfeelCATA({ selected }: { selected: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 7.5 }}>
      {MOUTHFEEL_OPTIONS.map((opt) => {
        const on = selected.includes(opt.id);
        return (
          <div key={opt.id} style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: on ? 700 : 400 }}>
            <Tick checked={on} size={7.5} />
            <span style={{ lineHeight: 1.2 }}>{opt.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Affective bubble row ───────────────────────────────────────────────────

function BubbleRow({ value, final }: { value: number | null; final: number | null }) {
  const displayed = final ?? value;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const on = n === displayed;
        const wasFirst = n === value && value !== final && final !== null;
        return (
          <div
            key={n}
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: `1px solid ${C.ink}`,
              background: on ? C.ink : wasFirst ? "#dcdcdc" : C.white,
              color: on ? C.white : C.ink,
              fontSize: 8.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {n}
          </div>
        );
      })}
      <div
        style={{
          marginLeft: 6,
          border: `1.5px solid ${C.ink}`,
          padding: "1px 6px",
          minWidth: 28,
          textAlign: "center",
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 1.1,
        }}
      >
        <div style={{ fontSize: 5.5, fontWeight: 700, letterSpacing: 1.5, color: C.muted }}>FINAL</div>
        <div>{displayed ?? "—"}</div>
      </div>
    </div>
  );
}

// ─── Cup grid (uniformity / defects) ────────────────────────────────────────

function CupGrid({ marks, color = C.ink, cups = 5 }: { marks: boolean[]; color?: string; cups?: number }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {Array.from({ length: cups }, (_, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <span style={{ fontSize: 6.5, color: C.inkSoft }}>{i + 1}</span>
          <Tick checked={marks[i] === true} size={12} color={color} />
        </div>
      ))}
    </div>
  );
}

// ─── Header strip used by every page ────────────────────────────────────────

function PageHeader({
  title,
  spec,
  cupperName,
  date,
  purpose,
  formatBadge,
}: {
  title: string;
  spec: string; // e.g. "SCA CVA · Descriptive Assessment"
  cupperName: string;
  date: string;
  purpose: string;
  formatBadge: string;
}) {
  const fieldStyle: React.CSSProperties = {
    fontSize: 7.5,
    color: C.inkSoft,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  };
  return (
    <div style={{ borderBottom: `2px solid ${C.rule}`, paddingBottom: 4, marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={fieldStyle}>{spec}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, lineHeight: 1.1 }}>{title}</div>
        </div>
        <div
          style={{
            border: `1.5px solid ${C.ink}`,
            padding: "2px 8px",
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {formatBadge}
        </div>
      </div>
      <div
        style={{
          marginTop: 4,
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 1.4fr",
          gap: 8,
          fontSize: 8.5,
        }}
      >
        <div>
          <div style={fieldStyle}>Name</div>
          <div style={{ borderBottom: `1px solid ${C.rule}`, minHeight: 12 }}>{cupperName || " "}</div>
        </div>
        <div>
          <div style={fieldStyle}>Date</div>
          <div style={{ borderBottom: `1px solid ${C.rule}`, minHeight: 12 }}>{date}</div>
        </div>
        <div>
          <div style={fieldStyle}>Purpose</div>
          <div style={{ borderBottom: `1px solid ${C.rule}`, minHeight: 12 }}>{purpose || " "}</div>
        </div>
      </div>
    </div>
  );
}

function NineScaleLegend() {
  return (
    <div
      style={{
        border: `1px solid ${C.ruleSoft}`,
        padding: "3px 6px",
        fontSize: 6.5,
        color: C.inkSoft,
        lineHeight: 1.35,
      }}
    >
      <div style={{ fontWeight: 700, color: C.ink, letterSpacing: 1, marginBottom: 1 }}>
        9-POINT IMPRESSION OF QUALITY
      </div>
      1 Extremely Low &nbsp; 2 Very Low &nbsp; 3 Mod. Low &nbsp; 4 Slightly Low &nbsp;
      <b>5 Neither High nor Low</b> &nbsp; 6 Slightly High &nbsp; 7 Mod. High &nbsp; 8 Very High &nbsp; 9 Extremely High
    </div>
  );
}

function SampleHeader({
  label,
  coffeeName,
  roastLevel,
}: {
  label: string;
  coffeeName: string | null;
  roastLevel: string;
}) {
  const fieldStyle: React.CSSProperties = {
    fontSize: 6.5,
    color: C.inkSoft,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        border: `1px solid ${C.rule}`,
        background: C.cream,
        padding: "3px 6px",
        marginBottom: 4,
      }}
    >
      <div>
        <span style={fieldStyle}>Sample No.</span>{" "}
        <b style={{ fontSize: 10 }}>{label}</b>
        {coffeeName && (
          <span style={{ marginLeft: 6, fontSize: 8.5, color: C.inkSoft }}>— {coffeeName}</span>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        <span style={fieldStyle}>Roast Level</span>{" "}
        <span style={{ fontSize: 8.5 }}>{roastLevel || "      "}</span>
      </div>
    </div>
  );
}

// ─── DESCRIPTIVE — per-sample block ─────────────────────────────────────────

function DescriptiveSampleBlock({ sample }: { sample: SampleData }) {
  // Per spec: Fragrance + Aroma share Box A. Flavor + Aftertaste share Box B + Box C.
  // Acidity + Sweetness are free-text only. Mouthfeel pairs with Box D.
  const d = sample.descriptive;

  const intRow = (label: string, key: string) => (
    <div style={{ marginBottom: 3 }}>
      <div
        style={{
          fontSize: 7.5,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: C.ink,
        }}
      >
        {label}
      </div>
      <IntensityScale value={num(d, `${key}_int`)} />
    </div>
  );

  const roastLevel = str(sample.physical, "roast_level") || str(sample.extrinsic, "ext_tueste_val");
  const fragranceAromaSelected = [...arr(d, "fragancia_desc"), ...arr(d, "aroma_desc")];
  const flavorAftertasteSelected = [...arr(d, "sabor_desc"), ...arr(d, "sabor_residual_desc")];
  const mainTastes = arr(d, "gustos");
  const mouthfeel = arr(d, "sensacion_desc");

  return (
    <div style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
      <SampleHeader label={sample.label} coffeeName={sample.coffeeName} roastLevel={roastLevel} />

      {/* Fragrance + Aroma + Box A */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 4 }}>
        <div>
          {intRow("Fragrance", "fragancia")}
          {intRow("Aroma", "aroma")}
        </div>
        <Box letter="A" title="Fragrance & Aroma" hint="máx. 5">
          <FlavorCATA selected={fragranceAromaSelected} />
        </Box>
      </div>

      {/* Flavor + Aftertaste + Box B + Box C */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.5fr", gap: 4, marginBottom: 4 }}>
        <div>
          {intRow("Flavor", "sabor")}
          {intRow("Aftertaste", "sabor_residual")}
        </div>
        <Box letter="B" title="Flavor & Aftertaste" hint="máx. 5">
          <FlavorCATA selected={flavorAftertasteSelected} />
        </Box>
        <Box letter="C" title="Main Tastes" hint="máx. 2">
          <MainTastesCATA selected={mainTastes} />
        </Box>
      </div>

      {/* Acidity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 4, marginBottom: 4 }}>
        <div>{intRow("Acidity", "acidez")}</div>
        <div>
          <div style={{ fontSize: 7, color: C.inkSoft, letterSpacing: 1, textTransform: "uppercase" }}>
            Notes
          </div>
          <NotesLine value={str(d, "acidez_desc_libre") || str(d, "acidez_notas")} lines={2} />
        </div>
      </div>

      {/* Sweetness */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 4, marginBottom: 4 }}>
        <div>{intRow("Sweetness", "dulzor")}</div>
        <div>
          <div style={{ fontSize: 7, color: C.inkSoft, letterSpacing: 1, textTransform: "uppercase" }}>
            Notes
          </div>
          <NotesLine value={str(d, "dulzor_desc_libre") || str(d, "dulzor_notas")} lines={2} />
        </div>
      </div>

      {/* Mouthfeel + Box D */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <div>{intRow("Mouthfeel", "sensacion")}</div>
        <Box letter="D" title="Mouthfeel" hint="máx. 2">
          <MouthfeelCATA selected={mouthfeel} />
        </Box>
      </div>
    </div>
  );
}

// ─── AFFECTIVE — per-sample column ──────────────────────────────────────────

const AFFECTIVE_LABELS_EN: Record<string, string> = {
  fragancia_af: "Fragrance",
  aroma_af: "Aroma",
  sabor_af: "Flavor",
  sabor_residual_af: "Aftertaste",
  acidez_af: "Acidity",
  dulzor_af: "Sweetness",
  sensacion_af: "Mouthfeel",
  impresion_global: "Overall",
};

function AffectiveSampleBlock({
  sample,
  cupsPerSample,
}: {
  sample: SampleData;
  cupsPerSample: number;
}) {
  const a = sample.affective;
  const cups = Math.max(cupsPerSample, 1);
  const nonUniform = bools(a, "tazas_no_uniformes", cups);
  const defective = bools(a, "tazas_defectuosas", cups);
  const defectTypes = arr(a, "defecto_tipo");
  const { sum } = calcAffectiveSum(a);
  const score = Object.keys(a).length > 0 ? calcIndividualScore(a, cupsPerSample) : "—";
  const u = cupsPerSample >= 5 ? nonUniform.filter(Boolean).length : 0;
  const dCount = cupsPerSample >= 5 ? defective.filter(Boolean).length : 0;

  const roastLevel = str(sample.physical, "roast_level") || str(sample.extrinsic, "ext_tueste_val");

  return (
    <div style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
      <SampleHeader label={sample.label} coffeeName={sample.coffeeName} roastLevel={roastLevel} />

      <div style={{ border: `1px solid ${C.rule}` }}>
        {AFFECTIVE_ATTRIBUTES.map((attr, i) => {
          const v = num(a, attr.id);
          const finalV = num(a, `${attr.id}_final`);
          const notes = str(a, `${attr.id}_notas`);
          return (
            <div
              key={attr.id}
              style={{
                borderBottom: i < AFFECTIVE_ATTRIBUTES.length - 1 ? `1px solid ${C.hairline}` : "none",
                padding: "3px 6px",
                display: "grid",
                gridTemplateColumns: "60px 1fr",
                gap: 6,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {AFFECTIVE_LABELS_EN[attr.id] ?? attr.label}
              </div>
              <div>
                <BubbleRow value={v} final={finalV} />
                {notes ? (
                  <div style={{ fontSize: 7, color: C.inkSoft, fontStyle: "italic", marginTop: 1 }}>
                    {notes}
                  </div>
                ) : (
                  <div style={{ borderBottom: `1px dotted ${C.ruleSoft}`, height: 9, marginTop: 2 }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Uniformity + Defects */}
      <div
        style={{
          marginTop: 4,
          border: `1px solid ${C.rule}`,
          padding: "3px 6px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 7,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: C.inkSoft,
              marginBottom: 2,
            }}
          >
            Uniformity {u > 0 ? `(−2 × ${u})` : ""}
          </div>
          <CupGrid marks={nonUniform} cups={cups} />
        </div>
        <div>
          <div
            style={{
              fontSize: 7,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: C.inkSoft,
              marginBottom: 2,
            }}
          >
            Defects {dCount > 0 ? `(−4 × ${dCount})` : ""}
          </div>
          <CupGrid marks={defective} cups={cups} color={C.red} />
          <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 7 }}>
            {(["moldy", "phenolic", "potato"] as SensoryDefect[]).map((k) => {
              const on = defectTypes.includes(k);
              return (
                <span
                  key={k}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontWeight: on ? 700 : 400,
                    color: on ? C.red : C.ink,
                  }}
                >
                  <Tick checked={on} size={7} color={C.red} />
                  {SENSORY_DEFECT_LABELS[k]}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Score */}
      <div
        style={{
          marginTop: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          border: `1.5px solid ${C.ink}`,
          padding: "4px 8px",
        }}
      >
        <div style={{ fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase", color: C.inkSoft }}>
          Cupping Score
          <div style={{ fontSize: 6.5, fontStyle: "italic", color: C.muted }}>
            0.65625 × Σh + 52.75 − 2u − 4d &nbsp; (Σh={sum}, u={u}, d={dCount})
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>{score}</div>
      </div>
    </div>
  );
}

// ─── COMBINED — one sample per landscape page ───────────────────────────────

function CombinedSamplePage({
  sample,
  session,
  cupperName,
  date,
  purpose,
}: {
  sample: SampleData;
  session: { name: string; cupsPerSample: number };
  cupperName: string;
  date: string;
  purpose: string;
}) {
  const d = sample.combined;
  const cups = Math.max(session.cupsPerSample, 1);

  // Two-column layout: descriptive (intensity + CATA) on left, affective on right
  const sections: { id: string; affId: string; label: string; hasIntensity: boolean }[] = [
    { id: "fragancia", affId: "fragancia_af", label: "Fragrance", hasIntensity: true },
    { id: "aroma", affId: "aroma_af", label: "Aroma", hasIntensity: true },
    { id: "sabor", affId: "sabor_af", label: "Flavor", hasIntensity: true },
    { id: "sabor_residual", affId: "sabor_residual_af", label: "Aftertaste", hasIntensity: true },
    { id: "acidez", affId: "acidez_af", label: "Acidity", hasIntensity: true },
    { id: "dulzor", affId: "dulzor_af", label: "Sweetness", hasIntensity: true },
    { id: "sensacion", affId: "sensacion_af", label: "Mouthfeel", hasIntensity: true },
    { id: "overall", affId: "impresion_global", label: "Overall", hasIntensity: false },
  ];

  const fragranceAromaSelected = [...arr(d, "fragancia_desc"), ...arr(d, "aroma_desc")];
  const flavorAftertasteSelected = [...arr(d, "sabor_desc"), ...arr(d, "sabor_residual_desc")];
  const mainTastes = arr(d, "gustos");
  const mouthfeel = arr(d, "sensacion_desc");

  const nonUniform = bools(d, "tazas_no_uniformes", cups);
  const defective = bools(d, "tazas_defectuosas", cups);
  const defectTypes = arr(d, "defecto_tipo");
  const { sum } = calcAffectiveSum(d);
  const score = Object.keys(d).length > 0 ? calcIndividualScore(d, session.cupsPerSample) : "—";
  const u = session.cupsPerSample >= 5 ? nonUniform.filter(Boolean).length : 0;
  const dCount = session.cupsPerSample >= 5 ? defective.filter(Boolean).length : 0;

  const extrinsicLines = [
    sample.extrinsic.ext_pais_val ? `País: ${String(sample.extrinsic.ext_pais_val)}` : null,
    sample.extrinsic.ext_region_val ? `Región: ${String(sample.extrinsic.ext_region_val)}` : null,
    sample.extrinsic.ext_finca_val ? `Finca: ${String(sample.extrinsic.ext_finca_val)}` : null,
    sample.extrinsic.ext_productor_val ? `Productor: ${String(sample.extrinsic.ext_productor_val)}` : null,
    sample.extrinsic.ext_variedad_val ? `Variedad: ${String(sample.extrinsic.ext_variedad_val)}` : null,
    sample.extrinsic.ext_proceso_tipo ? `Proceso: ${String(sample.extrinsic.ext_proceso_tipo)}` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="sca-page landscape">
      <PageHeader
        title={session.name}
        spec="SCA CVA · Combined Assessment"
        cupperName={cupperName}
        date={date}
        purpose={purpose}
        formatBadge="Combined"
      />

      <SampleHeader
        label={sample.label}
        coffeeName={sample.coffeeName}
        roastLevel={str(sample.physical, "roast_level") || str(sample.extrinsic, "ext_tueste_val")}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {/* Part 1 — Descriptive */}
        <div>
          <div
            style={{
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              borderBottom: `1px solid ${C.rule}`,
              paddingBottom: 1,
              marginBottom: 4,
            }}
          >
            Part 1 — Descriptive
          </div>

          {sections
            .filter((s) => s.hasIntensity)
            .map((s) => (
              <div key={s.id} style={{ marginBottom: 3 }}>
                <div
                  style={{
                    fontSize: 7.5,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                  }}
                >
                  {s.label}
                </div>
                <IntensityScale value={num(d, `${s.id}_int`)} height={14} />
              </div>
            ))}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
            <Box letter="A" title="Fragrance & Aroma" hint="máx. 5">
              <FlavorCATA selected={fragranceAromaSelected} />
            </Box>
            <Box letter="B" title="Flavor & Aftertaste" hint="máx. 5">
              <FlavorCATA selected={flavorAftertasteSelected} />
            </Box>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
            <Box letter="C" title="Main Tastes" hint="máx. 2">
              <MainTastesCATA selected={mainTastes} />
            </Box>
            <Box letter="D" title="Mouthfeel" hint="máx. 2">
              <MouthfeelCATA selected={mouthfeel} />
            </Box>
          </div>
        </div>

        {/* Part 2 — Affective */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `1px solid ${C.rule}`,
              paddingBottom: 1,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontSize: 8,
                fontWeight: 800,
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              Part 2 — Affective (1–9)
            </div>
          </div>
          <div style={{ marginBottom: 4 }}>
            <NineScaleLegend />
          </div>

          <div style={{ border: `1px solid ${C.rule}` }}>
            {sections.map((s, i) => {
              const v = num(d, s.affId);
              const finalV = num(d, `${s.affId}_final`);
              const notes = str(d, `${s.affId}_notas`);
              return (
                <div
                  key={s.affId}
                  style={{
                    borderBottom: i < sections.length - 1 ? `1px solid ${C.hairline}` : "none",
                    padding: "2px 6px",
                    display: "grid",
                    gridTemplateColumns: "70px 1fr",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                    }}
                  >
                    {s.label}
                  </div>
                  <div>
                    <BubbleRow value={v} final={finalV} />
                    {notes ? (
                      <div style={{ fontSize: 7, color: C.inkSoft, fontStyle: "italic", marginTop: 1 }}>
                        {notes}
                      </div>
                    ) : (
                      <div style={{ borderBottom: `1px dotted ${C.ruleSoft}`, height: 8, marginTop: 1 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Part 3 — Defects / Uniformity / Extrinsic */}
      <div
        style={{
          marginTop: 6,
          border: `1px solid ${C.rule}`,
          padding: "4px 6px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 0.9fr",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: C.inkSoft }}>
            Uniformity
          </div>
          <CupGrid marks={nonUniform} cups={cups} />
        </div>
        <div>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: C.inkSoft }}>
            Defects
          </div>
          <CupGrid marks={defective} cups={cups} color={C.red} />
          <div style={{ display: "flex", gap: 8, marginTop: 2, fontSize: 7 }}>
            {(["moldy", "phenolic", "potato"] as SensoryDefect[]).map((k) => {
              const on = defectTypes.includes(k);
              return (
                <span
                  key={k}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontWeight: on ? 700 : 400,
                    color: on ? C.red : C.ink,
                  }}
                >
                  <Tick checked={on} size={7} color={C.red} />
                  {SENSORY_DEFECT_LABELS[k]}
                </span>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: C.inkSoft }}>
            Extrinsic
          </div>
          <div style={{ fontSize: 7.5, color: C.ink, lineHeight: 1.3 }}>
            {extrinsicLines.length > 0 ? (
              extrinsicLines.map((l) => <div key={l}>{l}</div>)
            ) : (
              <>
                <div style={{ borderBottom: `1px dotted ${C.ruleSoft}`, height: 10 }} />
                <div style={{ borderBottom: `1px dotted ${C.ruleSoft}`, height: 10 }} />
                <div style={{ borderBottom: `1px dotted ${C.ruleSoft}`, height: 10 }} />
              </>
            )}
          </div>
        </div>
        <div>
          <div
            style={{
              border: `1.5px solid ${C.ink}`,
              padding: "4px 6px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase", color: C.inkSoft }}>
              Cupping Score
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 6, color: C.muted, fontStyle: "italic", marginTop: 1 }}>
              Σh={sum} u={u} d={dCount}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Page builders for each format ──────────────────────────────────────────

function chunkPairs<T>(xs: T[]): [T, T | null][] {
  const out: [T, T | null][] = [];
  for (let i = 0; i < xs.length; i += 2) out.push([xs[i], xs[i + 1] ?? null]);
  return out;
}

function DescriptivePages({
  samples,
  sessionName,
  cupperName,
  date,
  purpose,
}: {
  samples: SampleData[];
  sessionName: string;
  cupperName: string;
  date: string;
  purpose: string;
}) {
  const pairs = chunkPairs(samples);
  return (
    <>
      {pairs.map(([left, right], idx) => (
        <section key={idx} className="sca-page">
          <PageHeader
            title={sessionName}
            spec="SCA CVA · Descriptive Assessment"
            cupperName={cupperName}
            date={date}
            purpose={purpose}
            formatBadge="Descriptive"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <DescriptiveSampleBlock sample={left} />
            {right ? <DescriptiveSampleBlock sample={right} /> : <div />}
          </div>
        </section>
      ))}
    </>
  );
}

function AffectivePages({
  samples,
  sessionName,
  cupsPerSample,
  cupperName,
  date,
  purpose,
}: {
  samples: SampleData[];
  sessionName: string;
  cupsPerSample: number;
  cupperName: string;
  date: string;
  purpose: string;
}) {
  const pairs = chunkPairs(samples);
  return (
    <>
      {pairs.map(([left, right], idx) => (
        <section key={idx} className="sca-page">
          <PageHeader
            title={sessionName}
            spec="SCA CVA · Affective Assessment"
            cupperName={cupperName}
            date={date}
            purpose={purpose}
            formatBadge="Affective"
          />
          <div style={{ marginBottom: 4 }}>
            <NineScaleLegend />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <AffectiveSampleBlock sample={left} cupsPerSample={cupsPerSample} />
            {right ? (
              <AffectiveSampleBlock sample={right} cupsPerSample={cupsPerSample} />
            ) : (
              <div />
            )}
          </div>
        </section>
      ))}
    </>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function PrintClient({
  session,
}: {
  session: {
    id: string;
    name: string;
    format: string;
    cupsPerSample: number;
    date: string;
    objective?: string | null;
    cupperName: string;
    samples: SampleData[];
  };
}) {
  const formatLabel =
    session.format === "descriptive"
      ? "Descriptivo"
      : session.format === "affective"
        ? "Afectivo"
        : "Combinado";

  const purpose = session.objective ?? "";

  return (
    <div
      className="sca-shell"
      style={{
        background: "#EFEAE0",
        minHeight: "100vh",
        padding: "60px 0 40px",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      {/* Mobile-only overlay */}
      <div
        className="mobile-print-overlay"
        style={{
          display: "none",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "40px 28px",
          background: "#FDFBF7",
          gap: 28,
          textAlign: "center",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.green, lineHeight: 1.2, marginBottom: 10 }}>
            {session.name}
          </div>
          <div
            style={{
              display: "inline-block",
              background: C.green,
              color: C.white,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              padding: "3px 10px",
              borderRadius: 3,
            }}
          >
            SCA CVA · {formatLabel}
          </div>
        </div>
        <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
          El formato impreso usa hojas A4. Para mejores resultados, ábrelo desde un ordenador o tablet en horizontal.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 }}>
          <button
            onClick={() => window.print()}
            style={{
              background: C.green,
              color: C.white,
              border: "none",
              padding: "15px 0",
              borderRadius: 9,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              width: "100%",
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            🖨 Imprimir / Guardar como PDF
          </button>
          <button
            onClick={() => window.history.back()}
            style={{
              background: "transparent",
              border: `1px solid ${C.ruleSoft}`,
              color: C.inkSoft,
              padding: "12px 0",
              borderRadius: 9,
              fontSize: 13,
              cursor: "pointer",
              width: "100%",
            }}
          >
            ← Volver
          </button>
        </div>
      </div>

      {/* Screen-only top bar */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: C.green,
          color: C.white,
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 100,
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <button
          onClick={() => window.history.back()}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.4)",
            color: C.white,
            padding: "5px 12px",
            borderRadius: 5,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ← Volver
        </button>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", flex: 1 }}>
          Formato {formatLabel} · A4 · Ctrl+P / Cmd+P → &quot;Guardar como PDF&quot;
        </span>
        <button
          onClick={() => window.print()}
          style={{
            background: C.white,
            color: C.green,
            border: "none",
            padding: "7px 18px",
            borderRadius: 5,
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          🖨 Imprimir / PDF
        </button>
      </div>

      {/* Pages */}
      {session.format === "descriptive" && (
        <DescriptivePages
          samples={session.samples}
          sessionName={session.name}
          cupperName={session.cupperName}
          date={session.date}
          purpose={purpose}
        />
      )}

      {session.format === "affective" && (
        <AffectivePages
          samples={session.samples}
          sessionName={session.name}
          cupsPerSample={session.cupsPerSample}
          cupperName={session.cupperName}
          date={session.date}
          purpose={purpose}
        />
      )}

      {session.format === "combined" &&
        session.samples.map((s) => (
          <CombinedSamplePage
            key={s.id}
            sample={s}
            session={{ name: session.name, cupsPerSample: session.cupsPerSample }}
            cupperName={session.cupperName}
            date={session.date}
            purpose={purpose}
          />
        ))}

      {/* Empty fallback */}
      {session.samples.length === 0 && (
        <section className="sca-page">
          <PageHeader
            title={session.name}
            spec={`SCA CVA · ${formatLabel}`}
            cupperName={session.cupperName}
            date={session.date}
            purpose={purpose}
            formatBadge={formatLabel}
          />
          <div style={{ fontSize: 11, color: C.inkSoft, textAlign: "center", marginTop: 40 }}>
            No hay muestras en esta sesión.
          </div>
        </section>
      )}
    </div>
  );
}
