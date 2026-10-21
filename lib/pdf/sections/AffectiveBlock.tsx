import { View, Text } from "@react-pdf/renderer";
import { scoreBand } from "@/lib/scoring";
import type { FichaAffective } from "@/lib/reports/fichaTecnica";
import { PdfRadar, PdfScoreBand } from "../charts";
import { PDF_PALETTE } from "../palette";
import { BlockTitle, C, Chip, SECTION_TEXT, fmt, st, type Locale } from "./shared";

const RADAR_SIZE = 200;
const RADAR_CROP = 38;

const penalty = (n: number): string => (n > 0.005 ? `−${n.toFixed(2)}` : "0.00");

/** Community score, SD, included/submitted, single-polygon radar, per-attribute means, penalties. */
export function AffectiveBlock({
  affective,
  locale,
  showPenalties = true,
  showIncluded = true,
}: {
  affective: FichaAffective;
  locale: Locale;
  showPenalties?: boolean;
  showIncluded?: boolean;
}) {
  const t = SECTION_TEXT[locale];
  const score = affective.communityScore;
  const hasMeans = affective.attrAverages.some((a) => a.value !== null);

  return (
    <View style={st.sep}>
      <BlockTitle>{t.affective}</BlockTitle>
      {score === null && !hasMeans ? (
        <Text style={st.muted}>{t.noAffective}</Text>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ width: 118 }}>
            <Text style={st.kvLabel}>{t.communityScore}</Text>
            <View style={{ marginTop: 3 }}>
              {score !== null ? (
                <PdfScoreBand score={score} band={scoreBand(score)} size="lg" />
              ) : (
                <Text style={st.big}>—</Text>
              )}
            </View>
            {affective.sd !== null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 }}>
                <Chip>± {affective.sd.toFixed(1)}</Chip>
                <Text style={st.small}>{t.sd}</Text>
              </View>
            ) : null}
            {showIncluded ? (
              <Text style={[st.small, { marginTop: 5 }]}>
                {t.includedOf(affective.included, affective.submitted)}
              </Text>
            ) : null}
            {showPenalties ? (
              <View style={{ marginTop: 7 }}>
                <Text style={st.kvLabel}>{t.penalties}</Text>
                <Text style={[st.small, { marginTop: 2 }]}>
                  {t.uniformity}: {penalty(affective.uniformityPenalty)}
                </Text>
                <Text style={st.small}>
                  {t.defects}: {penalty(affective.defectPenalty)}
                </Text>
              </View>
            ) : null}
          </View>

          {hasMeans ? (
            <View
              style={{
                width: RADAR_SIZE,
                height: RADAR_SIZE - RADAR_CROP * 2,
                overflow: "hidden",
              }}
            >
              <View style={{ marginTop: -RADAR_CROP }}>
                <PdfRadar
                  axes={t.axes}
                  series={[
                    {
                      values: affective.attrAverages.map((a) => a.value ?? 1),
                      color: PDF_PALETTE.community,
                    },
                  ]}
                  size={RADAR_SIZE}
                />
              </View>
            </View>
          ) : null}

          {hasMeans ? (
            <View style={{ flexGrow: 1, flexBasis: 0 }}>
              <Text style={[st.kvLabel, { marginBottom: 3 }]}>{t.attrMeans}</Text>
              {affective.attrAverages.map((a, i) => (
                <View key={a.id} style={[st.row, { paddingVertical: 2 }]}>
                  <Text style={[st.body, { width: 78, fontSize: 8 }]}>{t.attrNames[i] ?? a.label}</Text>
                  <View style={{ flexGrow: 1, flexBasis: 0, height: 5, backgroundColor: C.paper }}>
                    <View
                      style={{
                        width: `${Math.max(0, Math.min(100, ((a.value ?? 0) / 9) * 100))}%`,
                        height: 5,
                        backgroundColor: PDF_PALETTE.community,
                      }}
                    />
                  </View>
                  <Text style={[st.body, { width: 26, textAlign: "right", fontWeight: 700 }]}>
                    {fmt(a.value, 1)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
