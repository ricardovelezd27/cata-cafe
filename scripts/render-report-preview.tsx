// Visual check for the lib/pdf/charts.tsx report primitives (CP-A2): radar
// (2 and 3 series), percent bars, score bands and delta chips on one A4 page.
//
//   npx tsx scripts/render-report-preview.tsx <outDir>
import { Document, Page, View, Text, StyleSheet, renderToFile } from "@react-pdf/renderer";
import path from "node:path";
import fs from "node:fs";
import { registerPdfFonts, SANS } from "../lib/pdf/fonts";
import { PDF_PALETTE } from "../lib/pdf/palette";
import {
  PdfRadar,
  PdfPercentBars,
  PdfScoreBand,
  PdfDeltaChip,
} from "../lib/pdf/charts";

registerPdfFonts();

const OUT = process.argv[2] ?? ".";
fs.mkdirSync(OUT, { recursive: true });

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: SANS, fontSize: 9, color: PDF_PALETTE.ink },
  h: { fontSize: 10, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  row: { flexDirection: "row", gap: 18, alignItems: "center" },
});

const axes = [
  "Fragancia",
  "Aroma",
  "Sabor",
  "Sabor residual",
  "Acidez",
  "Dulzor",
  "Sensación en boca",
  "Balance",
];

function Preview() {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h}>Radar 2 series / 3 series</Text>
        <View style={styles.row}>
          <PdfRadar
            axes={axes}
            size={230}
            series={[
              { values: [7, 8, 6, 5, 8, 7, 6, 7], color: PDF_PALETTE.mine, label: "Mi cata" },
              { values: [6, 6, 7, 6, 7, 5, 7, 6], color: PDF_PALETTE.community, label: "Comunidad" },
            ]}
          />
          <PdfRadar
            axes={axes}
            size={230}
            series={[
              { values: [7, 8, 6, 5, 8, 7, 6, 7], color: PDF_PALETTE.mine, label: "Mi cata" },
              { values: [6, 6, 7, 6, 7, 5, 7, 6], color: PDF_PALETTE.community, label: "Comunidad" },
              {
                values: [5, 5, 5, 5, 5, 5, 5, 5],
                color: PDF_PALETTE.reference,
                label: "Referencia",
                fillOpacity: 0.1,
              },
            ]}
          />
        </View>

        <Text style={styles.h}>Barras porcentuales</Text>
        <PdfPercentBars
          width={420}
          rows={[
            { label: "Frutal", count: 3, total: 7 },
            { label: "Floral", count: 7, total: 7 },
            { label: "Chocolate / cacao con una etiqueta muy larga", count: 1, total: 7, color: PDF_PALETTE.community },
            { label: "Especias", count: 0, total: 7 },
            { label: "Sin catadores", count: 0, total: 0 },
            { label: "Nuez", count: 5, total: 12 },
          ]}
        />

        <Text style={styles.h}>Score bands</Text>
        <View style={styles.row}>
          <PdfScoreBand score={86.25} band="green" />
          <PdfScoreBand score={79} band="amber" />
          <PdfScoreBand score={68.5} band="red" />
          <PdfScoreBand score={null} band="neutral" />
          <PdfScoreBand score={86.25} band="green" size="lg" />
          <PdfScoreBand score={79} band="amber" size="lg" />
          <PdfScoreBand score={68.5} band="red" size="lg" />
        </View>

        <Text style={styles.h}>Delta chips</Text>
        <View style={styles.row}>
          <PdfDeltaChip delta={2.5} />
          <PdfDeltaChip delta={-3.25} />
          <PdfDeltaChip delta={0} />
          <PdfDeltaChip delta={null} />
        </View>
      </Page>
    </Document>
  );
}

async function main() {
  const file = path.join(OUT, "report-preview.pdf");
  await renderToFile(Preview(), file);
  console.log("wrote", file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
