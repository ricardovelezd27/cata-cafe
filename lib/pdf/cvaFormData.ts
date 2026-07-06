// Pure data-assembly for the CVA-form PDF. NO @react-pdf imports here — the
// follow-up "email on session close" task reuses this to build the same data
// blob server-side, and the react-pdf document (CvaFormDocument.tsx) consumes it.
//
// Everything here mirrors the official SCA CVA paper form: the descriptive sheet
// (fragrance/aroma → flavor/aftertaste → basic tastes → acidity → sweetness →
// mouthfeel) and the affective sheet (8 attributes on 1–9 scales, uniformity /
// defect cup rows, overall + notes, final score). Selections are resolved to
// the official group/subgroup checkbox structure with L3 terms + qualifying
// notes collapsed onto the category's "Notas" line.

import {
  FLAVOR_WHEEL,
  ACIDITY_CATA,
  SWEETNESS_CATA,
  MOUTHFEEL_CATA,
  MAIN_TASTES,
  AFFECTIVE_ATTRIBUTES,
  SENSORY_DEFECTS,
  SENSORY_DEFECT_LABELS,
  migrateFlavorId,
  type FlavorWheelNode,
  type SensoryDefect,
} from "@/lib/constants";
import { resolveDescriptor, normalizeDescriptorId } from "@/lib/descriptors";
import { calcIndividualBreakdown, isAffectiveComplete } from "@/lib/scoring";

export type Locale = "es" | "en";
type D = Record<string, unknown>;

// ─── Generic accessors over the evaluation JSON blob ────────────────────────
const num = (d: D, k: string): number | null =>
  typeof d[k] === "number" ? (d[k] as number) : null;
const str = (d: D, k: string): string =>
  typeof d[k] === "string" ? (d[k] as string) : "";
const arr = (d: D, k: string): string[] =>
  Array.isArray(d[k]) ? (d[k] as string[]).filter((x) => typeof x === "string") : [];
const bools = (d: D, k: string, n: number): boolean[] => {
  const v = d[k];
  if (Array.isArray(v)) return Array.from({ length: n }, (_, i) => v[i] === true);
  return Array.from({ length: n }, () => false);
};

// ─── Layout text (es/en), following PrintClient's simple-map approach ───────
export const CVA_TEXT: Record<Locale, Record<string, string>> = {
  es: {
    descriptive: "Evaluación descriptiva",
    affective: "Evaluación afectiva",
    combined: "Evaluación combinada",
    spec: "SCA CVA · Formulario de catación",
    session: "Sesión",
    date: "Fecha",
    cupper: "Catador",
    sample: "Muestra",
    coffee: "Café",
    cups: "Tazas por muestra",
    purpose: "Propósito",
    fragrance: "Fragancia",
    aroma: "Aroma",
    flavor: "Sabor",
    aftertaste: "Sabor residual (regusto)",
    acidity: "Acidez",
    sweetness: "Dulzor",
    mouthfeel: "Sensación en boca",
    overall: "Impresión global",
    intensity: "Intensidad",
    low: "Bajo",
    medium: "Medio",
    high: "Alto",
    basicTastes: "Gustos básicos",
    notes: "Notas",
    partDescriptive: "Parte 1 — Descriptiva",
    partAffective: "Parte 2 — Afectiva (1–9)",
    uniformity: "Uniformidad",
    defects: "Defectos",
    nonUniform: "Tazas no uniformes",
    defectiveCups: "Tazas defectuosas",
    cupNumberShort: "Taza",
    score: "Puntaje de catación",
    scale9: "Escala 1–9 · 5 = ni alto ni bajo",
    extrinsic: "Datos extrínsecos",
    physical: "Evaluación física",
    beta: "Beta",
    none: "—",
    incomplete: "Evaluación incompleta",
    sheetDescriptive: "Hoja descriptiva",
    sheetAffective: "Hoja afectiva",
  },
  en: {
    descriptive: "Descriptive assessment",
    affective: "Affective assessment",
    combined: "Combined assessment",
    spec: "SCA CVA · Cupping form",
    session: "Session",
    date: "Date",
    cupper: "Cupper",
    sample: "Sample",
    coffee: "Coffee",
    cups: "Cups per sample",
    purpose: "Purpose",
    fragrance: "Fragrance",
    aroma: "Aroma",
    flavor: "Flavor",
    aftertaste: "Aftertaste",
    acidity: "Acidity",
    sweetness: "Sweetness",
    mouthfeel: "Mouthfeel",
    overall: "Overall",
    intensity: "Intensity",
    low: "Low",
    medium: "Medium",
    high: "High",
    basicTastes: "Basic tastes",
    notes: "Notes",
    partDescriptive: "Part 1 — Descriptive",
    partAffective: "Part 2 — Affective (1–9)",
    uniformity: "Uniformity",
    defects: "Defects",
    nonUniform: "Non-uniform cups",
    defectiveCups: "Defective cups",
    cupNumberShort: "Cup",
    score: "Cupping score",
    scale9: "1–9 scale · 5 = neither high nor low",
    extrinsic: "Extrinsic data",
    physical: "Physical evaluation",
    beta: "Beta",
    none: "—",
    incomplete: "Incomplete evaluation",
    sheetDescriptive: "Descriptive sheet",
    sheetAffective: "Affective sheet",
  },
};

// ─── Flavor-wheel checkbox model ────────────────────────────────────────────
//
// The official CVA descriptive form lists each L1 group with its L2 subgroups as
// checkboxes; specific L3 terms + qualifying notes ride on the group's "Notas"
// line. We ALWAYS print every group + subgroup (empty box when unselected). A
// selection marks its own box AND implies its ancestors' boxes (CVA convention:
// "mark the group, mark the subgroup").

export type FlavorSubgroupRow = {
  id: string; // L2 node id
  label: string;
  checked: boolean; // this subgroup (or any descendant) selected
};

export type FlavorGroupRow = {
  id: string; // L1 node id
  label: string;
  checked: boolean; // this group (or any descendant) selected
  subgroups: FlavorSubgroupRow[];
  /** L3 leaf labels + qualifying notes for this group, for the "Notas" line. */
  notesLine: string[];
};

const L1_NODES = FLAVOR_WHEEL.filter((n) => n.level === 1);
const nodeLabel = (n: FlavorWheelNode, locale: Locale) =>
  locale === "en" ? n.label_en : n.label_es;

/**
 * Build the always-print flavor checkbox grid for one descriptive stage,
 * marking selections and collapsing L3 leaves + qualifying notes onto each
 * group's notes line. `selectedIds` are raw stored ids (possibly legacy);
 * `qualNotes` is the parallel `<descKey>_notes` map (nodeId → terms).
 */
export function buildFlavorGroups(
  selectedIds: string[],
  qualNotes: Record<string, string[]>,
  locale: Locale
): FlavorGroupRow[] {
  // Migrate + dedupe selections, splitting off any legacy unmapped free text.
  const selected = new Set<string>();
  const extraNotes: string[] = []; // legacy unmapped:<text> that has no wheel home
  for (const raw of selectedIds) {
    const normalized = normalizeDescriptorId(raw); // unmapped:* → { id:"other", note }
    const migrated = migrateFlavorId(normalized.id);
    selected.add(migrated);
    if (normalized.note) extraNotes.push(normalized.note);
  }

  // Which L1 groups / L2 subgroups are (transitively) selected.
  const groupChecked = new Set<string>();
  const subChecked = new Set<string>();
  // Per-group notes-line entries: L3 leaf labels + their qualifying notes.
  const groupNotes = new Map<string, string[]>();

  const pushNote = (groupId: string, text: string) => {
    if (!text) return;
    const list = groupNotes.get(groupId) ?? [];
    list.push(text);
    groupNotes.set(groupId, list);
  };

  const nodeById = new Map(FLAVOR_WHEEL.map((n) => [n.id, n]));
  const l1Of = (id: string): string => {
    let n = nodeById.get(id);
    while (n && n.parentId) n = nodeById.get(n.parentId);
    return n?.id ?? "other";
  };

  for (const id of selected) {
    const node = nodeById.get(id);
    const groupId = l1Of(id);
    groupChecked.add(groupId);
    if (node) {
      if (node.level >= 2) {
        // mark the containing subgroup
        subChecked.add(node.level === 2 ? node.id : (node.parentId ?? node.id));
      }
      if (node.level === 3) {
        // L3 leaf → its label goes on the group's notes line
        pushNote(groupId, nodeLabel(node, locale));
      }
    } else {
      // Unknown id (should be rare) — fall back to resolveDescriptor label.
      const r = resolveDescriptor(id, locale);
      if (r) pushNote(groupId, r.label);
    }
  }

  // Qualifying notes: for every marked node, append its user-typed terms to the
  // notes line of the node's L1 group.
  for (const [nodeId, terms] of Object.entries(qualNotes)) {
    if (!Array.isArray(terms) || terms.length === 0) continue;
    const groupId = l1Of(migrateFlavorId(normalizeDescriptorId(nodeId).id));
    for (const t of terms) if (typeof t === "string" && t.trim()) pushNote(groupId, t.trim());
  }

  const rows: FlavorGroupRow[] = L1_NODES.map((g) => {
    const subgroups: FlavorSubgroupRow[] = FLAVOR_WHEEL.filter(
      (n) => n.level === 2 && n.parentId === g.id
    ).map((s) => ({
      id: s.id,
      label: nodeLabel(s, locale),
      checked: subChecked.has(s.id),
    }));
    return {
      id: g.id,
      label: nodeLabel(g, locale),
      checked: groupChecked.has(g.id),
      subgroups,
      notesLine: dedupe(groupNotes.get(g.id) ?? []),
    };
  });

  // Attach any orphan legacy free-text to the "other" group's notes line.
  if (extraNotes.length) {
    const other = rows.find((r) => r.id === "other");
    if (other) {
      other.checked = true;
      other.notesLine = dedupe([...other.notesLine, ...extraNotes]);
    }
  }

  return rows;
}

// ─── Flat CATA (acidity / sweetness / mouthfeel) checkbox model ─────────────
//
// These sets are Spanish-only 2-level lists. Same checkbox rules: always print
// every group + subgroup; mark selected; a subgroup selection implies its group;
// qualifying notes ride on the notes line.

export type CataSubRow = { id: string; label: string; checked: boolean };
export type CataGroupRow = {
  id: string;
  label: string;
  checked: boolean;
  subItems: CataSubRow[];
  notesLine: string[];
};

type CataSet = readonly {
  id: string;
  label: string;
  subItems: readonly { id: string; label: string }[];
}[];

const CATA_BY_STAGE: Record<string, CataSet> = {
  acidez: ACIDITY_CATA as unknown as CataSet,
  dulzor: SWEETNESS_CATA as unknown as CataSet,
  sensacion: MOUTHFEEL_CATA as unknown as CataSet,
};

export function buildCataGroups(
  stageId: "acidez" | "dulzor" | "sensacion",
  selectedIds: string[],
  qualNotes: Record<string, string[]>,
  locale: Locale
): CataGroupRow[] {
  const set = CATA_BY_STAGE[stageId];
  const selected = new Set(selectedIds);

  // group id → parent group for subitems
  const groupOfSub = new Map<string, string>();
  for (const g of set) for (const s of g.subItems) groupOfSub.set(s.id, g.id);

  const groupChecked = new Set<string>();
  for (const id of selected) {
    if (set.some((g) => g.id === id)) groupChecked.add(id);
    const parent = groupOfSub.get(id);
    if (parent) groupChecked.add(parent);
  }

  const groupNotes = new Map<string, string[]>();
  const groupOfAny = (id: string): string => {
    if (set.some((g) => g.id === id)) return id;
    return groupOfSub.get(id) ?? set[0]?.id ?? id;
  };
  for (const [nodeId, terms] of Object.entries(qualNotes)) {
    if (!Array.isArray(terms) || terms.length === 0) continue;
    const gid = groupOfAny(nodeId);
    const list = groupNotes.get(gid) ?? [];
    for (const t of terms) if (typeof t === "string" && t.trim()) list.push(t.trim());
    groupNotes.set(gid, list);
  }

  void locale; // sets are Spanish-only; label already localized upstream
  return set.map((g) => ({
    id: g.id,
    label: g.label,
    checked: groupChecked.has(g.id),
    subItems: g.subItems.map((s) => ({
      id: s.id,
      label: s.label,
      checked: selected.has(s.id),
    })),
    notesLine: dedupe(groupNotes.get(g.id) ?? []),
  }));
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const key = x.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(x);
    }
  }
  return out;
}

// ─── Descriptor stages, in official-form order ──────────────────────────────
export type DescriptorStageModel = {
  id: string;
  labelKey: string; // key into CVA_TEXT
  intensity: number | null;
  kind: "flavor" | "cata";
  flavorGroups?: FlavorGroupRow[];
  cataGroups?: CataGroupRow[];
  freeNotes: string; // the `<id>_notas` free-text notes field
};

// ─── Affective attribute rows ───────────────────────────────────────────────
export type AffectiveRow = {
  id: string; // e.g. fragancia_af
  labelKey: string;
  value: number | null; // 1–9 final
  notes: string;
};

// ─── Cups (uniformity / defect) ─────────────────────────────────────────────
export type CupModel = {
  cupsPerSample: number;
  penaltiesApply: boolean; // cupsPerSample >= 5
  nonUniform: boolean[];
  defective: boolean[];
  defectTypes: { id: SensoryDefect; label: string; checked: boolean }[];
  u: number;
  d: number;
};

// ─── Extrinsic / physical labeled blocks ────────────────────────────────────
export type LabeledField = { label: string; value: string };

const EXTRINSIC_FIELDS: { key: string; es: string }[] = [
  { key: "ext_pais_val", es: "País" },
  { key: "ext_region_val", es: "Región" },
  { key: "ext_finca_val", es: "Finca/Cooperativa" },
  { key: "ext_productor_val", es: "Productor(es)" },
  { key: "ext_especie_val", es: "Especie" },
  { key: "ext_variedad_val", es: "Variedad(es)" },
  { key: "ext_cosecha_val", es: "Cosecha" },
  { key: "ext_beneficiador_val", es: "Beneficiador(es)" },
  { key: "ext_proceso_tipo", es: "Proceso" },
  { key: "ext_clasificacion_val", es: "Clasificación" },
  { key: "ext_importador_val", es: "Importador" },
  { key: "ext_exportador_val", es: "Exportador" },
  { key: "ext_precio_val", es: "Precio al productor" },
  { key: "ext_lote_val", es: "Tamaño del lote" },
];

const PHYSICAL_FIELDS: { key: string; es: string }[] = [
  { key: "roast_level", es: "Nivel de tueste" },
  { key: "color", es: "Color del grano" },
  { key: "screen_size", es: "Tamaño de malla" },
  { key: "moisture", es: "Humedad" },
  { key: "density", es: "Densidad" },
];

function collectLabeled(
  d: D,
  fields: { key: string; es: string }[]
): LabeledField[] {
  const out: LabeledField[] = [];
  for (const f of fields) {
    const v = str(d, f.key);
    if (v.trim()) out.push({ label: f.es, value: v.trim() });
  }
  // Certifications live in an array.
  const certs = arr(d, "ext_certs");
  if (certs.length) out.push({ label: "Certificaciones", value: certs.join(", ") });
  return out;
}

// ─── Header block ───────────────────────────────────────────────────────────
export type SheetHeader = {
  sessionName: string;
  date: string;
  cupperName: string;
  sampleLabel: string;
  coffeeName: string | null; // only when revealed
  cupsPerSample: number;
  purpose: string;
};

// ─── The full per-sample sheet model ────────────────────────────────────────
export type CvaSampleSheet = {
  header: SheetHeader;
  format: "descriptive" | "affective" | "combined";
  descriptorStages: DescriptorStageModel[]; // descriptive + combined
  basicTastes: { id: string; label: string; checked: boolean }[];
  affectiveRows: AffectiveRow[]; // affective + combined
  cups: CupModel;
  score: number | "—";
  /**
   * Whether the affective evaluation is scoreable. calcAffectiveSum silently
   * substitutes a neutral 5 for every missing attribute, so a total printed
   * from a partially (or entirely) empty evaluation would fabricate a number
   * on a document sent to producers. Edge rule (matches the app's own
   * "complete" definition, isAffectiveComplete in lib/scoring.ts):
   * - "complete" — all 8 attribute finals present → print the real total.
   * - "partial"  — some finals set, some missing → print "—" plus an
   *   "evaluación incompleta" annotation (a partial Σh with silent 5-defaults
   *   is the same lie in smaller form).
   * - "empty"    — no finals at all → print "—", no annotation (a blank paper
   *   form is faithful).
   */
  scoreState: "complete" | "partial" | "empty";
  breakdown: { affectiveSum: number; u: number; d: number };
  extrinsic: LabeledField[];
  physical: LabeledField[];
};

export type CvaFormInput = {
  format: string; // session.format
  sessionName: string;
  date: string; // pre-formatted string
  cupperName: string;
  purpose: string;
  cupsPerSample: number;
  sample: {
    label: string;
    revealed: boolean;
    coffeeName: string | null;
    descriptive: D;
    affective: D;
    combined: D;
    physical: D;
    extrinsic: D;
  };
  locale: Locale;
};

const DESCRIPTOR_STAGE_DEFS: {
  id: string;
  labelKey: string;
  kind: "flavor" | "cata";
}[] = [
  { id: "fragancia", labelKey: "fragrance", kind: "flavor" },
  { id: "aroma", labelKey: "aroma", kind: "flavor" },
  { id: "sabor", labelKey: "flavor", kind: "flavor" },
  { id: "sabor_residual", labelKey: "aftertaste", kind: "flavor" },
  { id: "acidez", labelKey: "acidity", kind: "cata" },
  { id: "dulzor", labelKey: "sweetness", kind: "cata" },
  { id: "sensacion", labelKey: "mouthfeel", kind: "cata" },
];

/**
 * Assemble the full per-sample sheet model for the CVA PDF from one cupper's
 * evaluation blob. Descriptive-only sessions read `descriptive`, affective-only
 * read `affective`, combined reads the merged `combined` blob (falling back to
 * descriptive/affective if empty, matching how the app merges the combined form).
 */
export function buildCvaFormData(input: CvaFormInput): CvaSampleSheet {
  const format: "descriptive" | "affective" | "combined" =
    input.format === "affective"
      ? "affective"
      : input.format === "combined"
        ? "combined"
        : "descriptive";

  // Choose the source blob for each half of the sheet.
  const desc =
    format === "combined"
      ? nonEmpty(input.sample.combined) ?? input.sample.descriptive
      : input.sample.descriptive;
  const aff =
    format === "combined"
      ? nonEmpty(input.sample.combined) ?? input.sample.affective
      : input.sample.affective;

  const locale = input.locale;

  // ── Descriptor stages (descriptive + combined) ──
  const descriptorStages: DescriptorStageModel[] = [];
  if (format !== "affective") {
    for (const def of DESCRIPTOR_STAGE_DEFS) {
      const selected = arr(desc, `${def.id}_desc`);
      const qualNotes =
        (desc[`${def.id}_desc_notes`] as Record<string, string[]> | undefined) ?? {};
      descriptorStages.push({
        id: def.id,
        labelKey: def.labelKey,
        intensity: num(desc, `${def.id}_int`),
        kind: def.kind,
        flavorGroups:
          def.kind === "flavor"
            ? buildFlavorGroups(selected, qualNotes, locale)
            : undefined,
        cataGroups:
          def.kind === "cata"
            ? buildCataGroups(
                def.id as "acidez" | "dulzor" | "sensacion",
                selected,
                qualNotes,
                locale
              )
            : undefined,
        freeNotes: str(desc, `${def.id}_notas`),
      });
    }
  }

  // ── Basic tastes (descriptive + combined) ──
  const gustos = arr(desc, "gustos");
  const basicTastes = MAIN_TASTES.map((t) => ({
    id: t.id,
    label: t.label,
    checked: gustos.includes(t.id),
  }));

  // ── Affective rows (affective + combined) ──
  const affectiveRows: AffectiveRow[] = [];
  if (format !== "descriptive") {
    for (const attr of AFFECTIVE_ATTRIBUTES) {
      affectiveRows.push({
        id: attr.id,
        labelKey: AFF_LABEL_KEY[attr.id] ?? attr.id,
        value: num(aff, `${attr.id}_final`) ?? num(aff, attr.id),
        notes: str(aff, `${attr.id}_notas`),
      });
    }
  }

  // ── Cups (uniformity / defects) ──
  const cupsPerSample = Math.max(input.cupsPerSample, 1);
  const cupSource = format === "descriptive" ? desc : aff;
  const nonUniform = bools(cupSource, "tazas_no_uniformes", cupsPerSample);
  const defective = bools(cupSource, "tazas_defectuosas", cupsPerSample);
  const defectTipoRaw = arr(cupSource, "defecto_tipo");
  const penaltiesApply = input.cupsPerSample >= 5;
  const cups: CupModel = {
    cupsPerSample,
    penaltiesApply,
    nonUniform,
    defective,
    defectTypes: SENSORY_DEFECTS.map((id) => ({
      id,
      label: SENSORY_DEFECT_LABELS[id],
      checked: defectTipoRaw.includes(id),
    })),
    u: penaltiesApply ? nonUniform.filter(Boolean).length : 0,
    d: penaltiesApply ? defective.filter(Boolean).length : 0,
  };

  // ── Score ──
  // calcAffectiveSum defaults every unset attribute to a neutral 5, so an
  // empty evaluation would otherwise print a fabricated 79.00. Only print a
  // total when the evaluation is COMPLETE (all 8 finals present — the app's
  // own rule, isAffectiveComplete); a partial evaluation prints "—" with an
  // "evaluación incompleta" annotation. See CvaSampleSheet.scoreState.
  const scoreSource = format === "descriptive" ? desc : aff;
  let score: number | "—" = "—";
  let scoreState: "complete" | "partial" | "empty" = "empty";
  let breakdown = { affectiveSum: 0, u: cups.u, d: cups.d };
  if (format !== "descriptive") {
    const filledCount = AFFECTIVE_ATTRIBUTES.filter((attr) => {
      const v = Number(scoreSource[`${attr.id}_final`] ?? scoreSource[attr.id] ?? 0);
      return Number.isFinite(v) && v > 0;
    }).length;
    if (isAffectiveComplete(scoreSource)) {
      const b = calcIndividualBreakdown(scoreSource, input.cupsPerSample);
      score = b.score;
      scoreState = "complete";
      breakdown = { affectiveSum: b.affectiveSum, u: b.u, d: b.d };
    } else if (filledCount > 0) {
      scoreState = "partial";
    }
  }

  return {
    header: {
      sessionName: input.sessionName,
      date: input.date,
      cupperName: input.cupperName,
      sampleLabel: input.sample.label,
      coffeeName: input.sample.revealed ? input.sample.coffeeName : null,
      cupsPerSample: input.cupsPerSample,
      purpose: input.purpose,
    },
    format,
    descriptorStages,
    basicTastes,
    affectiveRows,
    cups,
    score,
    scoreState,
    breakdown,
    extrinsic: input.sample.revealed
      ? collectLabeled(input.sample.extrinsic, EXTRINSIC_FIELDS)
      : [],
    physical: collectLabeled(input.sample.physical, PHYSICAL_FIELDS),
  };
}

const AFF_LABEL_KEY: Record<string, string> = {
  fragancia_af: "fragrance",
  aroma_af: "aroma",
  sabor_af: "flavor",
  sabor_residual_af: "aftertaste",
  acidez_af: "acidity",
  dulzor_af: "sweetness",
  sensacion_af: "mouthfeel",
  impresion_global: "overall",
};

function nonEmpty(d: D): D | null {
  return d && Object.keys(d).length > 0 ? d : null;
}
