import { View, Text } from "@react-pdf/renderer";
import type { FichaDescriptive } from "@/lib/reports/fichaTecnica";
import { PdfPercentBars } from "../charts";
import { PDF_PALETTE } from "../palette";
import { sanitizePdfText } from "../text";
import { BlockTitle, C, INNER_W, SECTION_TEXT, st, type Locale } from "./shared";

const MAX_ROWS = 5;
const COL_W = (INNER_W - 16) / 2;

/** Per perceptual block: descriptor frequency bars + consensus sentence; then intensity means. */
export function DescriptiveBlock({
  descriptive,
  locale,
}: {
  descriptive: FichaDescriptive;
  locale: Locale;
}) {
  const t = SECTION_TEXT[locale];
  const blocks = descriptive.blocks.filter((b) => b.descriptors.length > 0);
  const means = descriptive.intensityMeans.filter((m) => m.mean !== null);

  return (
    <View style={st.sep}>
      <BlockTitle>{t.descriptive}</BlockTitle>
      {blocks.length === 0 ? (
        <Text style={st.muted}>{t.noDescriptors}</Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {blocks.map((b) => (
            <View key={b.blockId} style={{ width: COL_W, marginBottom: 9 }} wrap={false}>
              <Text style={[st.kvLabel, { marginBottom: 2 }]}>
                {t.blocks[b.blockId] ?? b.label}
              </Text>
              <PdfPercentBars
                rows={b.descriptors.map((d) => ({
                  label: sanitizePdfText(d.label),
                  count: d.count,
                  total: descriptive.totalEvaluators,
                  color: PDF_PALETTE.mine,
                }))}
                width={COL_W}
                maxRows={MAX_ROWS}
                valueFormat="percent"
                labelWidth={96}
                valueWidth={26}
              />
              {b.consensus ? (
                <Text style={[st.muted, { fontSize: 7.5, marginTop: 2, lineHeight: 1.3 }]}>
                  {sanitizePdfText(b.consensus)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
      {means.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Text style={[st.kvLabel, { marginBottom: 3 }]}>{t.intensity}</Text>
          <View style={{ flexDirection: "row" }}>
            {descriptive.intensityMeans.map((m) => (
              <View
                key={m.stage}
                style={{
                  flexGrow: 1,
                  flexBasis: 0,
                  backgroundColor: C.paper,
                  paddingVertical: 4,
                  paddingHorizontal: 5,
                  marginRight: 3,
                }}
              >
                <Text style={st.th}>{t.stages[m.stage] ?? m.stage}</Text>
                <Text style={{ fontSize: 11, fontWeight: 700, marginTop: 1 }}>
                  {m.mean === null ? "—" : m.mean.toFixed(1)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
