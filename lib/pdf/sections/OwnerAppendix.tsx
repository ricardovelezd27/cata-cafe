import { View, Text } from "@react-pdf/renderer";
import type { FichaOwnerAppendix } from "@/lib/reports/fichaTecnica";
import { PdfScoreBand } from "../charts";
import { PDF_PALETTE } from "../palette";
import { sanitizePdfText } from "../text";
import { C, CONTENT_W, SECTION_TEXT, fmt, st, type Locale } from "./shared";

const NAME_W = 118;
const MAX_COLS = 8;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Cupper x sample CVA matrix (band-coloured) with per-sample mean/SD + alignment ranking. */
export function OwnerAppendix({
  appendix,
  locale,
}: {
  appendix: FichaOwnerAppendix;
  locale: Locale;
}) {
  const t = SECTION_TEXT[locale];
  const sampleIdx = appendix.samples.map((_, i) => i);
  const groups = chunk(sampleIdx, MAX_COLS);
  const anyScore = appendix.cuppers.some((c) => c.scores.some((s) => s !== null));
  const ranking = [...appendix.alignment].sort((a, b) => b.alignment - a.alignment);

  return (
    <View>
      <Text style={st.tag}>{t.appendix}</Text>
      <Text style={[st.big, { marginTop: 2, marginBottom: 8 }]}>{t.appendixSub}</Text>

      {anyScore ? (
        <>
          {groups.map((g, gi) => {
            const colW = (CONTENT_W - NAME_W) / g.length;
            return (
              <View key={gi} style={{ marginBottom: 12 }} wrap={false}>
                <View style={st.row}>
                  <Text style={[st.th, { width: NAME_W }]}>{t.cupper}</Text>
                  {g.map((si) => (
                    <Text key={si} style={[st.th, { width: colW, textAlign: "center" }]}>
                      {sanitizePdfText(appendix.samples[si].label)}
                    </Text>
                  ))}
                </View>
                {appendix.cuppers.map((c) => (
                  <View key={c.id} style={st.row}>
                    <Text
                      style={[
                        st.body,
                        { width: NAME_W, paddingRight: 4 },
                        c.excluded ? { color: C.soft, fontStyle: "italic" } : {},
                      ]}
                    >
                      {sanitizePdfText(c.name)}
                      {c.excluded ? ` (${t.excluded})` : ""}
                    </Text>
                    {g.map((si) => (
                      <View key={si} style={{ width: colW, alignItems: "center" }}>
                        {c.scores[si] === null ? (
                          <Text style={st.small}>—</Text>
                        ) : c.excluded || c.bands[si] === "neutral" ? (
                          <Text style={[st.body, { fontWeight: 700 }]}>{fmt(c.scores[si])}</Text>
                        ) : (
                          <View style={{ flexDirection: "row", justifyContent: "center" }}>
                            <PdfScoreBand score={c.scores[si]} band={c.bands[si]} />
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                ))}
                <View style={st.row}>
                  <Text style={[st.th, { width: NAME_W }]}>{t.mean}</Text>
                  {g.map((si) => (
                    <Text key={si} style={[st.body, { width: colW, textAlign: "center", fontWeight: 700 }]}>
                      {appendix.rowStats[si].count > 0 ? fmt(appendix.rowStats[si].mean) : "—"}
                    </Text>
                  ))}
                </View>
                <View style={[st.row, { borderBottom: 0 }]}>
                  <Text style={[st.th, { width: NAME_W }]}>{t.sdShort}</Text>
                  {g.map((si) => (
                    <Text key={si} style={[st.body, { width: colW, textAlign: "center" }]}>
                      {appendix.rowStats[si].count > 1 ? `± ${appendix.rowStats[si].sd.toFixed(2)}` : "—"}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}
          <Text style={[st.small, { marginBottom: 14, lineHeight: 1.35 }]}>{t.bandLegend}</Text>
        </>
      ) : null}

      {ranking.length > 0 ? (
        <View wrap={false}>
          <Text style={st.blockTitle}>{t.alignmentRank}</Text>
          {ranking.map((r) => (
            <View key={r.id} style={st.row}>
              <Text
                style={[
                  st.body,
                  { width: NAME_W + 30 },
                  r.excluded ? { color: C.soft, fontStyle: "italic" } : {},
                ]}
              >
                {sanitizePdfText(r.name)}
                {r.excluded ? ` (${t.excluded})` : ""}
              </Text>
              <View style={{ flexGrow: 1, flexBasis: 0, height: 6, backgroundColor: C.paper }}>
                <View
                  style={{
                    width: `${Math.round(Math.max(0, Math.min(1, r.alignment)) * 100)}%`,
                    height: 6,
                    backgroundColor: PDF_PALETTE.mine,
                  }}
                />
              </View>
              <Text style={[st.body, { width: 36, textAlign: "right", fontWeight: 700 }]}>
                {Math.round(r.alignment * 100)}%
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
