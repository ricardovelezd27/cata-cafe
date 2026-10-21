import { View, Text } from "@react-pdf/renderer";
import { C, SECTION_TEXT, st, type Locale } from "./shared";

/** Submitted / included-in-score / participants counters for one sample. */
export function ParticipationBlock({
  participation,
  locale,
}: {
  participation: { submitted: number; included: number; total: number };
  locale: Locale;
}) {
  const t = SECTION_TEXT[locale];
  const items = [
    { label: t.invited, value: participation.total },
    { label: t.submitted, value: participation.submitted },
    { label: t.included, value: participation.included },
  ];
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row" }}>
        {items.map((it) => (
          <View
            key={it.label}
            style={{
              flexGrow: 1,
              flexBasis: 0,
              backgroundColor: C.paper,
              paddingVertical: 3,
              paddingHorizontal: 8,
              marginRight: 6,
            }}
          >
            <Text style={st.th}>{it.label}</Text>
            <Text style={{ fontSize: 11, fontWeight: 700 }}>{it.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
