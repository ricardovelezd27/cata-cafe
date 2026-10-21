import { View, Text } from "@react-pdf/renderer";
import { PDF_PALETTE } from "../palette";
import { sanitizePdfText } from "../text";
import { formatCoffeeCode } from "@/lib/coffeeCode";
import type { FichaIdentity } from "@/lib/reports/fichaTecnica";
import { C, KeyValues, SECTION_TEXT, st, type Locale } from "./shared";

/** Sample heading: label, coffee name, hyphenated code, roast, reference badge, origin facts. */
export function IdentityBlock({
  identity,
  locale,
  tag,
  showBlindNote = true,
  showFacts = true,
}: {
  identity: FichaIdentity;
  locale: Locale;
  /** Overrides the small caption above the label (default "Muestra"). */
  tag?: string;
  /** Show "coffee not revealed" when there is no coffee name (session sheets only). */
  showBlindNote?: boolean;
  /** Origin facts under the heading; hide when an origin-data block follows. */
  showFacts?: boolean;
}) {
  const t = SECTION_TEXT[locale];
  const code = formatCoffeeCode(identity.code);
  const facts = showFacts && identity.coffee
    ? (
        [
          ["country", identity.coffee.country],
          ["region", identity.coffee.region],
          ["farm", identity.coffee.farm],
          ["producer", identity.coffee.producer],
          ["variety", identity.coffee.variety],
          ["processType", identity.coffee.processType],
          ["altitude", identity.coffee.altitude],
        ] as const
      )
        .filter(([, v]) => !!v && String(v).trim())
        .map(([k, v]) => ({ label: t.originFacts[k], value: sanitizePdfText(String(v)) }))
    : [];

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 10 }}>
          <Text style={st.tag}>{tag ?? t.sample}</Text>
          <Text style={st.big}>{sanitizePdfText(identity.label)}</Text>
          {identity.coffeeName ? (
            <Text style={{ fontSize: 10.5, marginTop: 2, fontWeight: 700 }}>
              {sanitizePdfText(identity.coffeeName)}
            </Text>
          ) : showBlindNote ? (
            <Text style={[st.muted, { marginTop: 2 }]}>{t.blindCoffee}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          {identity.isReference ? (
            <View
              style={{
                backgroundColor: PDF_PALETTE.reference,
                borderRadius: 4,
                paddingVertical: 2,
                paddingHorizontal: 7,
                marginBottom: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  color: PDF_PALETTE.white,
                  textTransform: "uppercase",
                }}
              >
                {t.reference}
              </Text>
            </View>
          ) : null}
          {code ? (
            <View
              style={{
                borderWidth: 0.75,
                borderColor: C.hair,
                backgroundColor: C.paper,
                borderRadius: 4,
                paddingVertical: 2,
                paddingHorizontal: 7,
              }}
            >
              <Text style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>{code}</Text>
            </View>
          ) : null}
          {identity.roastLevel ? (
            <Text style={[st.small, { marginTop: 4 }]}>
              {t.roast}: {sanitizePdfText(identity.roastLevel)}
            </Text>
          ) : null}
        </View>
      </View>
      {facts.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <KeyValues rows={facts} />
        </View>
      ) : null}
    </View>
  );
}
