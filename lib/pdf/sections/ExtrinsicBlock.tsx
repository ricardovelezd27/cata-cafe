import { View } from "@react-pdf/renderer";
import { EXTRINSIC_FIELDS, collectLabeled } from "../cvaFormData";
import { BlockTitle, KeyValues, SECTION_TEXT, st, tr, type Locale } from "./shared";

/** Labelled origin rows over the ExtrinsicData blob. Renders nothing when empty. */
export function ExtrinsicBlock({
  extrinsic,
  locale,
}: {
  extrinsic: Record<string, unknown>;
  locale: Locale;
}) {
  const t = SECTION_TEXT[locale];
  const rows = collectLabeled(extrinsic, EXTRINSIC_FIELDS).map((r) => ({
    label: tr(t, r.label),
    value: r.value,
  }));
  if (rows.length === 0) return null;
  return (
    <View style={st.sep}>
      <BlockTitle>{t.extrinsicTitle}</BlockTitle>
      <KeyValues rows={rows} />
    </View>
  );
}
