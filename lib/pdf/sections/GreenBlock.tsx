import { View, Text } from "@react-pdf/renderer";
import { CAT1_DEFECTS, CAT2_DEFECTS, SCREEN_SIZES, calcFullDefects } from "@/lib/constants";
import { PHYSICAL_FIELDS, collectLabeled, physicalDerived } from "../cvaFormData";
import { PdfBarList } from "../charts";
import { SANS } from "../fonts";
import { PDF_PALETTE } from "../palette";
import { BlockTitle, INNER_W, KeyValues, SECTION_TEXT, st, tr, type Locale } from "./shared";

type D = Record<string, unknown>;
const num = (d: D, k: string): number => (typeof d[k] === "number" ? (d[k] as number) : 0);

type DefectRow = { name: string; ratio: string };

function DefectTable({
  title,
  defects,
  prefix,
  green,
  locale,
  width,
}: {
  title: string;
  defects: readonly DefectRow[];
  prefix: "phys_cat1" | "phys_cat2";
  green: D;
  locale: Locale;
  width: number;
}) {
  const t = SECTION_TEXT[locale];
  const rows = defects
    .map((d) => {
      const count = num(green, `${prefix}_${d.name}_count`);
      return { ...d, count, full: calcFullDefects(count, d.ratio) };
    })
    .filter((r) => r.count > 0);
  const total = rows.reduce((a, r) => a + r.full, 0);
  const cols = { name: width - 140, n: 40, r: 40, f: 60 };
  return (
    <View style={{ width }}>
      <Text style={[st.kvLabel, { marginBottom: 3 }]}>{title}</Text>
      <View style={st.row}>
        <Text style={[st.th, { width: cols.name }]}>{t.defectName}</Text>
        <Text style={[st.th, { width: cols.n, textAlign: "right" }]}>{t.defectCount}</Text>
        <Text style={[st.th, { width: cols.r, textAlign: "right" }]}>{t.defectRatio}</Text>
        <Text style={[st.th, { width: cols.f, textAlign: "right" }]}>{t.defectFull}</Text>
      </View>
      {rows.length === 0 ? (
        <Text style={[st.muted, { marginTop: 4 }]}>{t.greenNone}</Text>
      ) : (
        <>
          {rows.map((r) => (
            <View key={r.name} style={st.row}>
              <Text style={[st.body, { width: cols.name }]}>{r.name}</Text>
              <Text style={[st.body, { width: cols.n, textAlign: "right" }]}>{r.count}</Text>
              <Text style={[st.body, { width: cols.r, textAlign: "right" }]}>{r.ratio}</Text>
              <Text style={[st.body, { width: cols.f, textAlign: "right", fontWeight: 700 }]}>
                {r.full.toFixed(1)}
              </Text>
            </View>
          ))}
          <View style={[st.row, { borderBottom: 0 }]}>
            <Text style={[st.body, { width: cols.name + cols.n + cols.r, fontWeight: 700 }]}>
              {t.defectTotal}
            </Text>
            <Text style={[st.body, { width: cols.f, textAlign: "right", fontWeight: 700 }]}>
              {total.toFixed(1)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

/** Owner-only green-bean block. Renders nothing when no physical data exists. */
export function GreenBlock({ green, locale }: { green: D; locale: Locale }) {
  const t = SECTION_TEXT[locale];
  if (!green || Object.keys(green).length === 0) return null;

  const facts = [...collectLabeled(green, PHYSICAL_FIELDS), ...physicalDerived(green)].map((r) => ({
    label: tr(t, r.label),
    // physicalDerived prints "Malla 15 — 42%".
    value: locale === "en" ? r.value.replace(/^Malla /, "Screen ") : r.value,
  }));
  const screens = SCREEN_SIZES.map((s) => ({
    label: locale === "en" ? `Screen ${s}` : `Malla ${s}`,
    value: num(green, `phys_screen_${s}_g`),
    color: PDF_PALETTE.mine,
  })).filter((r) => r.value > 0);

  const half = (INNER_W - 14) / 2;
  return (
    <View style={st.sep}>
      <BlockTitle>{t.green}</BlockTitle>
      {facts.length > 0 ? <KeyValues rows={facts} /> : null}
      <View style={{ flexDirection: "row", gap: 14, marginTop: 4 }}>
        <DefectTable
          title={t.defectsCat1}
          defects={CAT1_DEFECTS}
          prefix="phys_cat1"
          green={green}
          locale={locale}
          width={half}
        />
        <DefectTable
          title={t.defectsCat2}
          defects={CAT2_DEFECTS}
          prefix="phys_cat2"
          green={green}
          locale={locale}
          width={half}
        />
      </View>
      {screens.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={[st.kvLabel, { marginBottom: 3 }]}>
            {t.screens} · {t.screensSub}
          </Text>
          <PdfBarList rows={screens} width={INNER_W * 0.7} maxRows={14} fontFamily={SANS} />
        </View>
      ) : null}
    </View>
  );
}
