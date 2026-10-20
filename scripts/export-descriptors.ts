// One-off, READ-ONLY export of the cupping descriptor reference data to an Excel
// workbook, for review with Kim / the product team.
//
//   npm run export:descriptors -- [output.xlsx]
//
// Default output: descriptors.xlsx in the current directory.
// Sheets (all built from lib/constants.ts, no database access):
//   - FLAVOR_WHEEL   live tree (L1 -> L2 -> L3) followed by retired ids from
//                    FLAVOR_ID_MIGRATION (retired=true, retired_alias_of = target)
//   - ACIDITY_CATA, SWEETNESS_CATA, MOUTHFEEL_CATA
//                    one row per top-level item and one per sub-item
import ExcelJS from "exceljs";
import { resolve } from "node:path";
import {
  ACIDITY_CATA,
  FLAVOR_ID_MIGRATION,
  FLAVOR_WHEEL,
  MOUTHFEEL_CATA,
  SWEETNESS_CATA,
} from "../lib/constants";

const DEFAULT_OUTPUT = "descriptors.xlsx";

type CataItem = {
  id: string;
  label: string;
  subItems: readonly { id: string; label: string }[];
};

function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function flavorRows(): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = FLAVOR_WHEEL.map((n) => ({
    id: n.id,
    level: n.level,
    parent: n.parentId,
    label_es: n.label_es,
    label_en: n.label_en,
    synonyms: n.synonyms.length > 0 ? n.synonyms.join(", ") : null,
    retired: false,
    retired_alias_of: null,
  }));
  for (const [retiredId, target] of Object.entries(FLAVOR_ID_MIGRATION)) {
    rows.push({
      id: retiredId,
      level: null,
      parent: null,
      label_es: null,
      label_en: null,
      synonyms: null,
      retired: true,
      retired_alias_of: target,
    });
  }
  return rows;
}

function cataRows(items: readonly CataItem[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const item of items) {
    rows.push({ id: item.id, family: item.label, sub_item: null, label: item.label });
    for (const sub of item.subItems) {
      rows.push({ id: sub.id, family: item.label, sub_item: sub.label, label: sub.label });
    }
  }
  return rows;
}

async function main() {
  const outPath = resolve(process.argv[2] ?? DEFAULT_OUTPUT);

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const sheets: { name: string; columns: { header: string; key: string; width: number }[]; rows: Record<string, unknown>[] }[] = [
    {
      name: "FLAVOR_WHEEL",
      columns: [
        { header: "id", key: "id", width: 42 },
        { header: "level", key: "level", width: 8 },
        { header: "parent", key: "parent", width: 30 },
        { header: "label_es", key: "label_es", width: 28 },
        { header: "label_en", key: "label_en", width: 28 },
        { header: "synonyms", key: "synonyms", width: 40 },
        { header: "retired", key: "retired", width: 10 },
        { header: "retired_alias_of", key: "retired_alias_of", width: 36 },
      ],
      rows: flavorRows(),
    },
    {
      name: "ACIDITY_CATA",
      columns: [
        { header: "id", key: "id", width: 30 },
        { header: "family", key: "family", width: 28 },
        { header: "sub_item", key: "sub_item", width: 28 },
        { header: "label", key: "label", width: 28 },
      ],
      rows: cataRows(ACIDITY_CATA as readonly CataItem[]),
    },
    {
      name: "SWEETNESS_CATA",
      columns: [
        { header: "id", key: "id", width: 30 },
        { header: "family", key: "family", width: 28 },
        { header: "sub_item", key: "sub_item", width: 28 },
        { header: "label", key: "label", width: 28 },
      ],
      rows: cataRows(SWEETNESS_CATA as readonly CataItem[]),
    },
    {
      name: "MOUTHFEEL_CATA",
      columns: [
        { header: "id", key: "id", width: 30 },
        { header: "family", key: "family", width: 28 },
        { header: "sub_item", key: "sub_item", width: 28 },
        { header: "label", key: "label", width: 28 },
      ],
      rows: cataRows(MOUTHFEEL_CATA as readonly CataItem[]),
    },
  ];

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.columns = sheet.columns;
    for (const row of sheet.rows) ws.addRow(row);
    styleHeader(ws);
  }

  await wb.xlsx.writeFile(outPath);

  console.log(`Wrote ${outPath}`);
  for (const sheet of sheets) {
    console.log(`  ${sheet.name}: ${sheet.rows.length} rows`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
