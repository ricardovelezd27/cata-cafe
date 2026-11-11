// Server-only. The generation stamp every report carries under its title:
// server date/time, language, the n-of-N inclusion line, the "updated after
// close" / "origin edited" notes and a "Borrador" marker for unsent drafts.
// Text comes from lib/pdf/stampText.ts (pure, tested).

import { View, Text } from "@react-pdf/renderer";
import { PDF_PALETTE } from "../palette";
import { buildStampLines, type StampInput } from "../stampText";
import { C } from "./shared";

export type ReportStampProps = Omit<StampInput, "generatedAt"> & {
  /** Defaults to the server clock at render time. */
  generatedAt?: Date;
};

export function ReportStamp({ generatedAt, draft, ...rest }: ReportStampProps) {
  const lines = buildStampLines({ ...rest, draft, generatedAt: generatedAt ?? new Date() });
  return (
    <View style={{ marginTop: 4 }}>
      {lines.map((line, i) => {
        const isDraft = draft === true && i === 0;
        return (
          <Text
            key={i}
            style={{
              fontSize: isDraft ? 8 : 6.5,
              fontWeight: isDraft ? 700 : 400,
              color: isDraft ? PDF_PALETTE.band.red : C.soft,
              marginTop: i === 0 ? 0 : 1.5,
            }}
          >
            {line}
          </Text>
        );
      })}
    </View>
  );
}
