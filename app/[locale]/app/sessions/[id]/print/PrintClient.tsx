"use client";

// Browser-print view of a cupper's evaluation, laid out to the SAME geometry as
// the server-rendered PDF (lib/pdf/CvaFormDocument.tsx):
//
//   Descriptive — A4 portrait, two samples per page, one shared CATA box for
//                 Fragrance+Aroma and one for Flavor+Aftertaste.
//   Affective   — A4 landscape, samples as side-by-side columns (3 per page).
//   Combined    — A4 landscape, Part 1 descriptive left / Part 2 affective right.
//
// Both surfaces read the SAME model (buildCvaFormData), so "Imprimir" and
// "Descargar PDF" produce the same document. cvaFormData is pure — no
// @react-pdf, no server-only imports — so a client component may import it, but
// never import CvaFormDocument here.
//
// Sizes are in pt to match the PDF's point-based metrics one-for-one.

import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";
import {
  buildCvaFormData,
  CVA_TEXT,
  type CvaSampleSheet,
  type FlavorGroupRow,
  type CataGroupRow,
  type StageId,
  type Locale,
} from "@/lib/pdf/cvaFormData";

// ─── Palette — mirrors CvaFormDocument ──────────────────────────────────────
const C = {
  ink: "#111111",
  rule: "#000000",
  soft: "#555555",
  hair: "#cfcfcf",
  cream: "#f4f0e8",
  green: "#3D5A3E",
  red: "#A83232",
  white: "#FFFFFF",
};

const SERIF = "'Times New Roman', Times, serif";

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

  /* On-screen A4 simulation — padding matches the PDF page style exactly. */
  .sca-page {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    background: white;
    box-shadow: 0 4px 14px rgba(0,0,0,0.10);
    margin: 0 auto 14mm auto;
    padding: 20pt 22pt 34pt;
    box-sizing: border-box;
    color: ${C.ink};
    font-family: Helvetica, Arial, sans-serif;
    font-size: 7pt;
    line-height: 1.2;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .sca-page * { box-sizing: border-box; }

  /* Affective and Combined sheets are landscape, like the official forms. */
  .sca-page.landscape {
    width: 297mm;
    min-height: 210mm;
  }
  @media print {
    .sca-page.landscape { page: landscape; }
    @page landscape { size: A4 landscape; margin: 0; }
  }

  @media screen and (max-width: 767px) {
    .sca-page { display: none !important; }
    .mobile-print-overlay { display: flex !important; }
    /* The overlay carries its own controls; the fixed bar would double them. */
    .sca-topbar { display: none !important; }
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
  /** Gates origin data: an unrevealed sample must not print extrinsic fields. */
  revealed: boolean;
  coffeeName: string | null;
  descriptive: D;
  affective: D;
  combined: D;
  physical: D;
  extrinsic: D;
};

type T = Record<string, string>;

// ─── Shared style fragments ─────────────────────────────────────────────────
const S = {
  wordmark: {
    fontSize: "6.5pt",
    letterSpacing: "1.6pt",
    color: C.soft,
    textTransform: "uppercase",
  } as React.CSSProperties,
  formName: { fontSize: "14pt", fontFamily: SERIF, fontWeight: 700, marginTop: 1 },
  fieldLabel: {
    fontSize: "5.5pt",
    letterSpacing: "1.1pt",
    color: C.soft,
    textTransform: "uppercase",
  } as React.CSSProperties,
  fieldValue: {
    fontSize: "8pt",
    borderBottom: `0.5pt dotted ${C.soft}`,
    minHeight: "11pt",
    paddingTop: "1.5pt",
  },
  stripLabel: {
    fontSize: "5.5pt",
    letterSpacing: "1.1pt",
    color: C.soft,
    textTransform: "uppercase",
  } as React.CSSProperties,
  cataTitle: {
    fontSize: "5.5pt",
    fontWeight: 700,
    letterSpacing: "1.1pt",
    textTransform: "uppercase",
    background: C.cream,
    borderBottom: `0.5pt solid ${C.rule}`,
    padding: "1pt 5pt",
  } as React.CSSProperties,
  groupLabel: {
    fontSize: "5.5pt",
    fontWeight: 700,
    textTransform: "uppercase",
    lineHeight: 1.1,
  } as React.CSSProperties,
  subLabel: { fontSize: "5pt", lineHeight: 1.1 },
  paren: { fontSize: "5pt", color: C.soft },
  notesLabel: {
    fontSize: "5pt",
    letterSpacing: "0.9pt",
    color: C.soft,
    textTransform: "uppercase",
    marginRight: "3pt",
    paddingTop: "1pt",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  caption: {
    fontSize: "5pt",
    letterSpacing: "0.8pt",
    color: C.soft,
    textTransform: "uppercase",
  } as React.CSSProperties,
  partBanner: {
    fontSize: "6pt",
    fontWeight: 700,
    letterSpacing: "1.3pt",
    textTransform: "uppercase",
    borderBottom: `1pt solid ${C.rule}`,
    paddingBottom: "1.5pt",
    marginBottom: "4pt",
  } as React.CSSProperties,
  metaLabel: {
    fontSize: "5pt",
    letterSpacing: "0.9pt",
    color: C.soft,
    textTransform: "uppercase",
  } as React.CSSProperties,
};

// ─── Primitives ─────────────────────────────────────────────────────────────

function CheckBox({
  checked,
  size = 6,
  color = C.ink,
}: {
  checked: boolean;
  size?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: `${size}pt`,
        height: `${size}pt`,
        border: `0.6pt solid ${color}`,
        borderRadius: "0.5pt",
        background: checked ? color : C.white,
        color: C.white,
        fontSize: `${size - 1.5}pt`,
        fontWeight: 700,
        lineHeight: 1,
        marginRight: "2pt",
        flexShrink: 0,
      }}
    >
      {checked ? "x" : ""}
    </span>
  );
}

function DotField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: "1 1 0" }}>
      <div style={S.fieldLabel}>{label}</div>
      <div style={S.fieldValue}>{value || " "}</div>
    </div>
  );
}

/** 0–15 continuous intensity ruler with LOW/MEDIUM/HIGH bands and a marker. */
function IntensityRow({
  name,
  value,
  t,
  compact,
  nameWidth,
}: {
  name: string;
  value: number | null;
  t: T;
  compact?: boolean;
  /** Widen where the Spanish section names would otherwise wrap to two lines. */
  nameWidth?: string;
}) {
  const pct = value === null ? null : (Math.max(0, Math.min(15, value)) / 15) * 100;
  const axisTop = compact ? 2.5 : 4;
  const bandH = compact ? 4.5 : 7;
  const axisH = compact ? 8 : 12;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        marginBottom: compact ? "1pt" : "3pt",
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      <div
        style={{
          width: nameWidth ?? (compact ? "50pt" : "58pt"),
          fontSize: compact ? "8pt" : "9pt",
          fontFamily: SERIF,
          lineHeight: 1.1,
          paddingTop: compact ? "2pt" : "3pt",
          flexShrink: 0,
        }}
      >
        {name}
      </div>
      <div style={{ flex: "1 1 0" }}>
        <div style={{ position: "relative", height: `${bandH}pt` }}>
          {[
            [t.low, "6%"],
            [t.medium, "43%"],
            [t.high, "84%"],
          ].map(([label, left]) => (
            <div
              key={left}
              style={{
                position: "absolute",
                left,
                fontSize: "5pt",
                letterSpacing: "1pt",
                color: C.soft,
              }}
            >
              {label.toUpperCase()}
            </div>
          ))}
        </div>
        <div style={{ position: "relative", height: `${axisH}pt` }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${axisTop}pt`,
              height: "0.6pt",
              background: C.rule,
            }}
          />
          {Array.from({ length: 16 }, (_, i) => {
            const h = i % 5 === 0 ? 6 : 3;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${(i / 15) * 100}%`,
                  top: `${axisTop - h / 2}pt`,
                  width: "0.6pt",
                  height: `${h}pt`,
                  background: C.rule,
                }}
              />
            );
          })}
          {[0, 5, 10, 15].map((m) => (
            <div
              key={m}
              style={{
                position: "absolute",
                left: `${(m / 15) * 100}%`,
                top: `${axisTop + 2}pt`,
                transform: "translateX(-50%)",
                fontSize: "4.5pt",
                color: C.soft,
              }}
            >
              {m}
            </div>
          ))}
          {pct !== null && (
            <div
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: `${axisTop - 7.5}pt`,
                transform: "translateX(-50%)",
                fontSize: "7pt",
                fontWeight: 700,
                lineHeight: 1,
                color: C.ink,
              }}
              aria-hidden
            >
              ▼
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NotesLine({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginTop: "2pt" }}>
      <div style={S.notesLabel}>{label}</div>
      {items.length > 0 ? (
        <div style={{ fontSize: "6pt", fontStyle: "italic", flex: "1 1 0" }}>
          {items.join(" · ")}
        </div>
      ) : (
        <div style={{ borderBottom: `0.5pt dotted ${C.hair}`, height: "8pt", flex: "1 1 0" }} />
      )}
    </div>
  );
}

// ─── CATA rows in the official parenthetical style ──────────────────────────
//
//   [x] FRUITY ( [ ] Berry  [x] Citrus  [ ] Dried fruit )

type Row = {
  id: string;
  label: string;
  checked: boolean;
  subs: { id: string; label: string; checked: boolean }[];
};

const flavorToRow = (g: FlavorGroupRow): Row => ({
  id: g.id,
  label: g.label,
  checked: g.checked,
  subs: g.subgroups,
});

const cataToRow = (g: CataGroupRow): Row => ({
  id: g.id,
  label: g.label,
  checked: g.checked,
  subs: g.subItems,
});

function CataRow({ row }: { row: Row }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: "0.5pt",
        lineHeight: 1.1,
      }}
    >
      <CheckBox checked={row.checked} size={5} />
      <span style={S.groupLabel}>{row.label}</span>
      {row.subs.length > 0 && (
        <>
          <span style={{ ...S.paren, marginLeft: "2pt", marginRight: "1pt" }}>(</span>
          {row.subs.map((sub) => (
            <span
              key={sub.id}
              style={{ display: "inline-flex", alignItems: "center", marginRight: "3pt" }}
            >
              <CheckBox checked={sub.checked} size={4} />
              <span style={S.subLabel}>{sub.label}</span>
            </span>
          ))}
          <span style={S.paren}>)</span>
        </>
      )}
    </div>
  );
}

function CataBox({
  title,
  section,
  rows,
  notes,
  notesLabel,
  columns = 2,
  aside,
  grow,
}: {
  title: string;
  section?: string;
  rows: Row[];
  notes?: string[];
  notesLabel?: string;
  columns?: number;
  aside?: React.ReactNode;
  grow?: number;
}) {
  const per = Math.ceil(rows.length / columns);
  const cols = Array.from({ length: columns }, (_, i) => rows.slice(i * per, (i + 1) * per));
  return (
    <div
      style={{
        border: `0.75pt solid ${C.rule}`,
        marginBottom: "2pt",
        flex: grow ? `${grow} 1 0` : undefined,
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      <div style={S.cataTitle}>{section ? `${section} · ${title}` : title}</div>
      <div style={{ padding: "2pt 5pt", display: aside ? "flex" : "block", gap: "8pt" }}>
        <div style={{ flex: "1 1 0" }}>
          <div style={{ display: "flex", gap: "8pt" }}>
            {cols.map((col, ci) => (
              <div key={ci} style={{ flex: "1 1 0" }}>
                {col.map((row) => (
                  <CataRow key={row.id} row={row} />
                ))}
              </div>
            ))}
          </div>
          {notes && notesLabel ? <NotesLine label={notesLabel} items={notes} /> : null}
        </div>
        {aside}
      </div>
    </div>
  );
}

function MainTastesAside({ sheet, t }: { sheet: CvaSampleSheet; t: T }) {
  return (
    <div style={{ width: "74pt", borderLeft: `0.5pt solid ${C.hair}`, paddingLeft: "6pt" }}>
      <div style={{ ...S.cataTitle, background: "none", border: "none", padding: 0, marginBottom: "2pt" }}>
        {t.mainTastesTitle}
      </div>
      {sheet.basicTastes.map((bt) => (
        <div key={bt.id} style={{ display: "flex", alignItems: "center", marginBottom: "1pt" }}>
          <CheckBox checked={bt.checked} size={5.5} />
          <span style={S.subLabel}>{bt.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Affective primitives ───────────────────────────────────────────────────

const QUALITY_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"];

const shortLabel = (t: T, key: string) => t[`${key}Short`] ?? t[key] ?? key;

function QualityLegend({ t }: { t: T }) {
  return (
    <div
      style={{
        display: "flex",
        border: `0.5pt solid ${C.hair}`,
        padding: "2pt 4pt",
        marginBottom: "4pt",
      }}
    >
      <div
        style={{
          fontSize: "5.5pt",
          fontWeight: 700,
          letterSpacing: "1.1pt",
          textTransform: "uppercase",
          marginRight: "6pt",
          whiteSpace: "nowrap",
        }}
      >
        {t.impressionOfQuality}
      </div>
      {QUALITY_KEYS.map((k, i) => (
        <div key={k} style={{ fontSize: "5pt", color: C.soft, flex: "1 1 0", textAlign: "center" }}>
          {i + 1} {t[k]}
        </div>
      ))}
    </div>
  );
}

function Bubbles({ value, none }: { value: number | null; none: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const on = n === value;
        return (
          <div
            key={n}
            style={{
              width: "12pt",
              height: "12pt",
              borderRadius: "50%",
              border: `0.6pt solid ${C.ink}`,
              background: on ? C.ink : C.white,
              color: on ? C.white : C.ink,
              fontSize: "6pt",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "2pt",
              flexShrink: 0,
            }}
          >
            {n}
          </div>
        );
      })}
      <div
        style={{
          marginLeft: "4pt",
          border: `0.9pt solid ${C.ink}`,
          padding: "0.5pt 3pt",
          minWidth: "21pt",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "4pt", letterSpacing: "0.9pt", color: C.soft }}>FINAL</div>
        <div style={{ fontSize: "8.5pt", fontWeight: 700 }}>{value ?? none}</div>
      </div>
    </div>
  );
}

function CupBoxes({ marks, color = C.ink }: { marks: boolean[]; color?: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
      {marks.map((on, i) => (
        <div
          key={i}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", marginRight: "5pt" }}
        >
          <span style={{ fontSize: "4.5pt", color: C.soft, marginBottom: "0.5pt" }}>{i + 1}</span>
          <span
            style={{
              width: "9pt",
              height: "9pt",
              border: `0.6pt solid ${on ? color : C.ink}`,
              borderRadius: "0.5pt",
              background: on ? color : C.white,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function DefectTypes({ sheet }: { sheet: CvaSampleSheet }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap" }}>
      {sheet.cups.defectTypes.map((dt) => (
        <span
          key={dt.id}
          style={{ display: "inline-flex", alignItems: "center", marginRight: "6pt" }}
        >
          <CheckBox checked={dt.checked} size={5.5} color={dt.checked ? C.red : C.ink} />
          <span style={{ fontSize: "6pt", color: dt.checked ? C.red : C.ink }}>{dt.label}</span>
        </span>
      ))}
    </div>
  );
}

function ScoreCell({ sheet, t }: { sheet: CvaSampleSheet; t: T }) {
  return (
    <div>
      <div style={{ fontSize: "15pt", fontWeight: 700 }}>
        {sheet.scoreState === "complete" ? sheet.score : t.none}
      </div>
      {sheet.scoreState === "complete" ? (
        <div style={{ fontSize: "4.5pt", color: C.soft, fontStyle: "italic", marginTop: "0.5pt" }}>
          Σh={sheet.breakdown.affectiveSum} · u={sheet.breakdown.u} · d={sheet.breakdown.d}
        </div>
      ) : sheet.scoreState === "partial" ? (
        <div style={{ fontSize: "4.5pt", color: C.soft, fontStyle: "italic", marginTop: "0.5pt" }}>
          {t.incomplete}
        </div>
      ) : null}
    </div>
  );
}

// ─── Page furniture ─────────────────────────────────────────────────────────

function SheetHeader({ sheet, t, formName }: { sheet: CvaSampleSheet; t: T; formName: string }) {
  const h = sheet.header;
  return (
    <div style={{ borderBottom: `1.5pt solid ${C.rule}`, paddingBottom: "4pt", marginBottom: "6pt" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={S.wordmark}>SCA {t.methodology}</div>
          <div style={S.formName}>{formName}</div>
        </div>
        <div style={{ ...S.wordmark, letterSpacing: "1.4pt" }}>Cata Café</div>
      </div>
      <div style={{ display: "flex", gap: "10pt", marginTop: "5pt" }}>
        <DotField label={t.name} value={h.cupperName} />
        <DotField label={t.date} value={h.date} />
        <DotField label={t.purpose} value={h.purpose} />
        <DotField label={t.session} value={h.sessionName} />
      </div>
    </div>
  );
}

function SheetFooter({ t }: { t: T }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "22pt",
        right: "22pt",
        bottom: "16pt",
        borderTop: `0.5pt solid ${C.hair}`,
        paddingTop: "3pt",
        fontSize: "5pt",
        color: C.soft,
        lineHeight: 1.3,
      }}
    >
      {t.attribution}
    </div>
  );
}

function SampleStrip({ sheet, t }: { sheet: CvaSampleSheet; t: T }) {
  const h = sheet.header;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        border: `0.75pt solid ${C.rule}`,
        background: C.cream,
        padding: "2.5pt 6pt",
        marginBottom: "4pt",
      }}
    >
      <div>
        <span style={S.stripLabel}>{t.sampleNo} </span>
        <b style={{ fontSize: "10pt" }}>{h.sampleLabel}</b>
      </div>
      {h.coffeeName ? (
        <div>
          <span style={S.stripLabel}>{t.coffee} </span>
          <span style={{ fontSize: "8pt" }}>{h.coffeeName}</span>
        </div>
      ) : (
        <div style={S.stripLabel}>
          {t.cups}: {h.cupsPerSample}
        </div>
      )}
    </div>
  );
}

// Large, pure black-on-white QR block for the join link — printed only on the
// sheet's first page, never minted here (page.tsx supplies the URL only when a
// valid invite already exists).
function InviteQRBlock({ url, caption }: { url: string; caption: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10pt",
        border: `1.5pt solid ${C.rule}`,
        padding: "6pt 10pt",
        marginBottom: "6pt",
        pageBreakInside: "avoid",
        breakInside: "avoid",
      }}
    >
      <div style={{ background: C.white, padding: "4pt", lineHeight: 0 }}>
        <QRCodeSVG value={url} size={200} level="M" marginSize={0} bgColor="#FFFFFF" fgColor="#000000" />
      </div>
      <div
        style={{
          fontSize: "10pt",
          fontWeight: 700,
          letterSpacing: "0.6pt",
          textTransform: "uppercase",
        }}
      >
        {caption}
      </div>
    </div>
  );
}

// ─── Descriptive sample block (half a portrait page) ────────────────────────

function DescriptiveBlock({ sheet, t }: { sheet: CvaSampleSheet; t: T }) {
  const d = sheet.descriptive;
  const int = (id: StageId) => d.intensity[id];
  return (
    <div>
      <SampleStrip sheet={sheet} t={t} />

      {/* Fragrance + Aroma share Box A — orthonasal. */}
      <IntensityRow name={t.fragrance} value={int("fragancia")} t={t} compact nameWidth="76pt" />
      <IntensityRow name={t.aroma} value={int("aroma")} t={t} compact nameWidth="76pt" />
      <CataBox
        title={t.selectUpToFive}
        rows={d.boxA.map(flavorToRow)}
        notes={d.boxANotes}
        notesLabel={t.notes}
      />

      {/* Flavor + Aftertaste share Box B — retronasal — with main tastes beside. */}
      <IntensityRow name={t.flavor} value={int("sabor")} t={t} compact nameWidth="76pt" />
      <IntensityRow name={t.aftertaste} value={int("sabor_residual")} t={t} compact nameWidth="76pt" />
      <CataBox
        title={t.selectUpToFive}
        rows={d.boxB.map(flavorToRow)}
        notes={d.boxBNotes}
        notesLabel={t.notes}
        aside={<MainTastesAside sheet={sheet} t={t} />}
      />

      <IntensityRow name={t.acidity} value={int("acidez")} t={t} compact nameWidth="76pt" />
      <CataBox title={t.selectAllApply} rows={d.acidity.map(cataToRow)} columns={3} />

      <IntensityRow name={t.sweetness} value={int("dulzor")} t={t} compact nameWidth="76pt" />
      <CataBox title={t.selectAllApply} rows={d.sweetness.map(cataToRow)} />

      <IntensityRow name={t.mouthfeel} value={int("sensacion")} t={t} compact nameWidth="76pt" />
      <CataBox title={t.selectUpToTwo} rows={d.mouthfeel.map(cataToRow)} columns={3} />
    </div>
  );
}

// ─── Affective grid: samples as columns, official landscape layout ──────────

const CELL: React.CSSProperties = {
  flex: "1 1 0",
  padding: "2.5pt 5pt",
  borderRight: `0.5pt solid ${C.hair}`,
};
const ROW_LABEL: React.CSSProperties = {
  width: "76pt",
  flexShrink: 0,
  fontSize: "7.5pt",
  fontFamily: SERIF,
  padding: "3pt 4pt",
  borderRight: `0.5pt solid ${C.hair}`,
};
const ROW_LABEL_SM: React.CSSProperties = {
  ...ROW_LABEL,
  fontSize: "5.5pt",
  fontFamily: "inherit",
  letterSpacing: "0.8pt",
  color: C.soft,
  textTransform: "uppercase",
};

function AffectiveGridPage({
  sheets,
  t,
  qr,
}: {
  sheets: CvaSampleSheet[];
  t: T;
  qr?: React.ReactNode;
}) {
  const first = sheets[0];
  // Keep column width stable when the last page holds fewer than three samples.
  const pad = Array.from({ length: Math.max(0, 3 - sheets.length) });

  return (
    <section className="sca-page landscape">
      <SheetHeader sheet={first} t={t} formName={t.formAffective} />
      {qr}
      <QualityLegend t={t} />

      <div style={{ border: `0.75pt solid ${C.rule}` }}>
        <div style={{ display: "flex", borderBottom: `0.75pt solid ${C.rule}`, background: C.cream }}>
          <div style={ROW_LABEL_SM}>{t.sampleNo}</div>
          {sheets.map((sheet) => (
            <div key={sheet.header.sampleLabel} style={{ ...CELL, padding: "3pt 5pt" }}>
              <div style={{ fontSize: "10pt", fontWeight: 700 }}>{sheet.header.sampleLabel}</div>
              {sheet.header.coffeeName && (
                <div style={{ fontSize: "6pt", color: C.soft }}>{sheet.header.coffeeName}</div>
              )}
            </div>
          ))}
          {pad.map((_, i) => (
            <div key={`p${i}`} style={CELL} />
          ))}
        </div>

        {first.affectiveRows.map((row, ri) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              borderBottom:
                ri === first.affectiveRows.length - 1 ? "none" : `0.5pt solid ${C.hair}`,
            }}
          >
            <div style={ROW_LABEL}>{shortLabel(t, row.labelKey)}</div>
            {sheets.map((sheet) => {
              const cell = sheet.affectiveRows[ri];
              return (
                <div key={sheet.header.sampleLabel} style={CELL}>
                  <Bubbles value={cell?.value ?? null} none={t.none} />
                  {cell?.notes && (
                    <div style={{ fontSize: "5.5pt", color: C.soft, fontStyle: "italic", marginTop: "1pt" }}>
                      {cell.notes}
                    </div>
                  )}
                </div>
              );
            })}
            {pad.map((_, i) => (
              <div key={`p${i}`} style={CELL} />
            ))}
          </div>
        ))}
      </div>

      {/* Uniformity / defects / score band */}
      <div style={{ border: `0.75pt solid ${C.rule}`, marginTop: "4pt" }}>
        {(
          [
            [t.nonUniform, (sh: CvaSampleSheet) => <CupBoxes marks={sh.cups.nonUniform} />],
            [t.defectiveCups, (sh: CvaSampleSheet) => <CupBoxes marks={sh.cups.defective} color={C.red} />],
            [t.defectIfAny, (sh: CvaSampleSheet) => <DefectTypes sheet={sh} />],
            [t.score, (sh: CvaSampleSheet) => <ScoreCell sheet={sh} t={t} />],
          ] as [string, (sh: CvaSampleSheet) => React.ReactNode][]
        ).map(([label, render], i, all) => (
          <div
            key={label}
            style={{
              display: "flex",
              borderBottom: i === all.length - 1 ? "none" : `0.5pt solid ${C.hair}`,
            }}
          >
            <div style={ROW_LABEL_SM}>{label}</div>
            {sheets.map((sheet) => (
              <div key={sheet.header.sampleLabel} style={CELL}>
                {render(sheet)}
              </div>
            ))}
            {pad.map((_, pi) => (
              <div key={`p${pi}`} style={CELL} />
            ))}
          </div>
        ))}
      </div>

      <SheetFooter t={t} />
    </section>
  );
}

// ─── Combined: Part 1 left / Part 2 right (landscape) ───────────────────────

function CombinedPage({ sheet, t, qr }: { sheet: CvaSampleSheet; t: T; qr?: React.ReactNode }) {
  const d = sheet.descriptive;
  const int = (id: StageId) => d.intensity[id];
  return (
    <section className="sca-page landscape">
      <SheetHeader sheet={sheet} t={t} formName={t.formCombined} />
      {qr}
      <SampleStrip sheet={sheet} t={t} />

      <div style={{ display: "flex", gap: "10pt" }}>
        {/* Part 1 — descriptive */}
        <div style={{ flex: "1 1 0" }}>
          <div style={S.partBanner}>{t.partDescriptive}</div>
          <IntensityRow name={t.fragrance} value={int("fragancia")} t={t} compact />
          <IntensityRow name={t.aroma} value={int("aroma")} t={t} compact />
          <CataBox
            title={t.selectUpToFive}
            rows={d.boxA.map(flavorToRow)}
            notes={d.boxANotes}
            notesLabel={t.notes}
          />
          <IntensityRow name={t.flavor} value={int("sabor")} t={t} compact />
          <IntensityRow name={t.aftertaste} value={int("sabor_residual")} t={t} compact />
          <CataBox
            title={t.selectUpToFive}
            rows={d.boxB.map(flavorToRow)}
            notes={d.boxBNotes}
            notesLabel={t.notes}
            aside={<MainTastesAside sheet={sheet} t={t} />}
          />
          <IntensityRow name={t.acidity} value={int("acidez")} t={t} compact />
          <IntensityRow name={t.sweetness} value={int("dulzor")} t={t} compact />
          <IntensityRow name={t.mouthfeel} value={int("sensacion")} t={t} compact />
          {/* The last three CATA lists run across rather than stacked — Part 1
              otherwise overflows the landscape page. */}
          <div style={{ display: "flex", gap: "5pt" }}>
            <CataBox
              section={t.acidity}
              title={t.selectAllApply}
              rows={d.acidity.map(cataToRow)}
              columns={2}
              grow={1.6}
            />
            <CataBox
              section={t.sweetness}
              title={t.selectAllApply}
              rows={d.sweetness.map(cataToRow)}
              columns={1}
              grow={1}
            />
            <CataBox
              section={t.mouthfeel}
              title={t.selectUpToTwo}
              rows={d.mouthfeel.map(cataToRow)}
              columns={1}
              grow={1}
            />
          </div>
        </div>

        {/* Part 2 — affective. Sized to the bubble row + FINAL box. */}
        <div style={{ width: "182pt", flexShrink: 0 }}>
          <div style={S.partBanner}>{t.partAffective}</div>
          <div style={{ border: `0.75pt solid ${C.rule}` }}>
            {sheet.affectiveRows.map((row, i) => (
              <div
                key={row.id}
                style={{
                  padding: "3pt 4pt",
                  borderBottom:
                    i === sheet.affectiveRows.length - 1 ? "none" : `0.5pt solid ${C.hair}`,
                }}
              >
                <div style={{ fontSize: "8pt", fontFamily: SERIF, marginBottom: "1.5pt" }}>
                  {t[row.labelKey] ?? row.labelKey}
                </div>
                <Bubbles value={row.value} none={t.none} />
                {row.notes && (
                  <div style={{ fontSize: "5.5pt", color: C.soft, fontStyle: "italic", marginTop: "1pt" }}>
                    {row.notes}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ border: `0.75pt solid ${C.rule}`, marginTop: "4pt", padding: "3pt 5pt" }}>
            <div style={S.caption}>{t.nonUniform}</div>
            <CupBoxes marks={sheet.cups.nonUniform} />
            <div style={{ ...S.caption, marginTop: "3pt" }}>{t.defectiveCups}</div>
            <CupBoxes marks={sheet.cups.defective} color={C.red} />
            <div style={{ marginTop: "3pt" }}>
              <DefectTypes sheet={sheet} />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              border: `1.25pt solid ${C.ink}`,
              padding: "3pt 6pt",
              marginTop: "4pt",
            }}
          >
            <div style={S.caption}>{t.score}</div>
            <ScoreCell sheet={sheet} t={t} />
          </div>
        </div>
      </div>

      {/* Part 3 (extrinsic) lives on the shared appendix page — see MetaAppendix. */}
      <SheetFooter t={t} />
    </section>
  );
}

// ─── Physical / extrinsic appendix, shared by all three formats ─────────────

function MetaFields({ fields }: { fields: { label: string; value: string }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6pt" }}>
      {fields.map((f, i) => (
        <div key={i} style={{ flexBasis: "31%", marginBottom: "2pt" }}>
          <div style={S.metaLabel}>{f.label}</div>
          <div style={{ fontSize: "7pt" }}>{f.value}</div>
        </div>
      ))}
    </div>
  );
}

function MetaBlock({ title, fields }: { title: string; fields: { label: string; value: string }[] }) {
  if (fields.length === 0) return null;
  return (
    <div style={{ border: `0.75pt solid ${C.rule}`, marginBottom: "4pt" }}>
      <div style={S.cataTitle}>{title}</div>
      <div style={{ padding: "3pt 5pt" }}>
        <MetaFields fields={fields} />
      </div>
    </div>
  );
}

function MetaAppendix({ sheets, t, formName }: { sheets: CvaSampleSheet[]; t: T; formName: string }) {
  const withData = sheets.filter((sh) => sh.physical.length + sh.extrinsic.length > 0);
  if (withData.length === 0) return null;
  return (
    <section className="sca-page">
      <SheetHeader sheet={sheets[0]} t={t} formName={formName} />
      <div style={S.partBanner}>{t.partExtrinsic}</div>
      {withData.map((sheet, i) => (
        <div key={i} style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
          <SampleStrip sheet={sheet} t={t} />
          <MetaBlock title={t.physical} fields={sheet.physical} />
          <MetaBlock title={t.extrinsic} fields={sheet.extrinsic} />
        </div>
      ))}
      <SheetFooter t={t} />
    </section>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

function chunk<T2>(xs: T2[], size: number): T2[][] {
  const out: T2[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export function PrintClient({
  locale,
  session,
  inviteUrl,
  scanToJoinLabel,
}: {
  locale?: string;
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
  inviteUrl?: string | null;
  scanToJoinLabel?: string;
}) {
  const loc: Locale = locale === "en" ? "en" : "es";
  const t = CVA_TEXT[loc];
  const purpose = session.objective ?? "";

  const formatLabel =
    session.format === "descriptive"
      ? t.formDescriptive
      : session.format === "affective"
        ? t.formAffective
        : t.formCombined;

  // Same model the PDF renders from, so the two surfaces cannot drift apart.
  const sheets: CvaSampleSheet[] = session.samples.map((sample) =>
    buildCvaFormData({
      format: session.format,
      sessionName: session.name,
      date: session.date,
      cupperName: session.cupperName,
      purpose,
      cupsPerSample: session.cupsPerSample,
      sample,
      locale: loc,
    })
  );

  const qr = inviteUrl ? <InviteQRBlock url={inviteUrl} caption={scanToJoinLabel ?? ""} /> : null;
  const format = sheets[0]?.format;

  return (
    <div className="sca-shell" style={{ background: "#EFEAE0", minHeight: "100vh", padding: "60px 0 40px" }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      {/* Mobile-only overlay — A4 sheets are unreadable at phone width. */}
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
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.green, lineHeight: 1.2, marginBottom: 10, fontFamily: SERIF }}>
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
              borderRadius: 9999,
            }}
          >
            SCA CVA · {formatLabel}
          </div>
        </div>
        <div className="font-ui" style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>
          El formato impreso usa hojas A4. Para mejores resultados, ábrelo desde un ordenador o tablet
          en horizontal.
        </div>
        <div className="flex w-full max-w-[320px] flex-col gap-2">
          <button
            onClick={() => window.print()}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-pill bg-primary-container px-4 font-ui text-sm font-medium text-on-primary transition-colors hover:bg-primary"
          >
            <Printer size={16} aria-hidden />
            Imprimir o guardar como PDF
          </button>
          <button
            onClick={() => window.history.back()}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-pill px-4 font-ui text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <ArrowLeft size={16} aria-hidden />
            Volver
          </button>
        </div>
      </div>

      {/* Screen-only top bar */}
      <div
        className="no-print sca-topbar"
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
        }}
      >
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 rounded-pill border border-white/40 px-3 py-1.5 font-ui text-xs font-medium text-white transition-colors hover:bg-white/10"
        >
          <ArrowLeft size={14} aria-hidden />
          Volver
        </button>
        <span className="flex-1 font-ui text-[11px] text-white/75">
          {formatLabel} · A4 · Ctrl+P / Cmd+P → &quot;Guardar como PDF&quot;
        </span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-pill bg-white px-4 py-1.5 font-ui text-xs font-medium text-primary-container transition-colors hover:bg-surface-container"
        >
          <Printer size={14} aria-hidden />
          Imprimir
        </button>
      </div>

      {/* Descriptive — portrait, two samples per page. */}
      {format === "descriptive" &&
        chunk(sheets, 2).map((pair, i) => (
          <section key={i} className="sca-page">
            <SheetHeader sheet={pair[0]} t={t} formName={t.formDescriptive} />
            {i === 0 && qr}
            {pair.map((sheet, j) => (
              <div key={j} style={{ marginTop: j > 0 ? "6pt" : 0 }}>
                <DescriptiveBlock sheet={sheet} t={t} />
              </div>
            ))}
            <SheetFooter t={t} />
          </section>
        ))}

      {/* Affective — landscape, samples as columns, three per page. */}
      {format === "affective" &&
        chunk(sheets, 3).map((group, i) => (
          <AffectiveGridPage key={i} sheets={group} t={t} qr={i === 0 ? qr : undefined} />
        ))}

      {/* Combined — landscape, one sample per page. */}
      {format === "combined" &&
        sheets.map((sheet, i) => (
          <CombinedPage key={i} sheet={sheet} t={t} qr={i === 0 ? qr : undefined} />
        ))}

      {sheets.length > 0 && <MetaAppendix sheets={sheets} t={t} formName={formatLabel} />}

      {/* Empty fallback */}
      {sheets.length === 0 && (
        <section className="sca-page">
          <div style={{ borderBottom: `1.5pt solid ${C.rule}`, paddingBottom: "4pt", marginBottom: "6pt" }}>
            <div style={S.wordmark}>SCA {t.methodology}</div>
            <div style={S.formName}>{formatLabel}</div>
          </div>
          {qr}
          <div style={{ fontSize: "11pt", color: C.soft, textAlign: "center", marginTop: "40pt" }}>
            No hay muestras en esta sesión.
          </div>
          <SheetFooter t={t} />
        </section>
      )}
    </div>
  );
}
