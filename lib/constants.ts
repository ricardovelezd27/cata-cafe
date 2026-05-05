// Reference data for the SCA CVA cupping protocol.
// Labels are in Spanish; translations happen in the UI layer via next-intl.

/* ============================================================
   NEW: Cupping sections (SCA CVA chronological order)
   ============================================================ */
export const CUPPING_SECTIONS = [
  { id: 'fragrance',  label: 'Fragancia',         labelEs: 'Fragancia',         step: 1, type: 'orthonasal' },
  { id: 'aroma',      label: 'Aroma',             labelEs: 'Aroma',             step: 2, type: 'orthonasal' },
  { id: 'flavor',     label: 'Sabor',             labelEs: 'Sabor',             step: 3, type: 'gustative_retronasal' },
  { id: 'aftertaste', label: 'Regusto',           labelEs: 'Regusto',           step: 3, type: 'gustative_retronasal' },
  { id: 'acidity',    label: 'Acidez',            labelEs: 'Acidez',            step: 3, type: 'gustative',            freeDescriptors: true },
  { id: 'sweetness',  label: 'Dulzor',            labelEs: 'Dulzor',            step: 3, type: 'gustative_retronasal', freeDescriptors: true },
  { id: 'mouthfeel',  label: 'Sensación en Boca', labelEs: 'Sensación en Boca', step: 3, type: 'tactile' },
  { id: 'overall',    label: 'Global',            labelEs: 'Global',            step: 4, affectiveOnly: true },
] as const

export type CuppingSectionId = (typeof CUPPING_SECTIONS)[number]['id']

/* ============================================================
   NEW: Affective scale (1–9) labels — Record<number, string>
   ============================================================ */
export const AFFECTIVE_LABELS: Record<number, string> = {
  1: 'Extremadamente bajo',
  2: 'Muy bajo',
  3: 'Moderadamente bajo',
  4: 'Ligeramente bajo',
  5: 'Ni alto ni bajo',
  6: 'Ligeramente alto',
  7: 'Moderadamente alto',
  8: 'Muy alto',
  9: 'Extremadamente alto',
}

export const AFFECTIVE_SHORT: Record<number, string> = {
  1: 'Extr. bajo', 2: 'Muy bajo',  3: 'Mod. bajo',
  4: 'Lig. bajo',  5: 'Neutro',    6: 'Lig. alto',
  7: 'Mod. alto',  8: 'Muy alto',  9: 'Extr. alto',
}

/* ============================================================
   NEW: CATA flavor families (with sub-descriptors + colors)
   ============================================================ */
export const FLAVOR_FAMILIES = [
  { id: 'floral',         label: 'Floral',           color: '#C17817', subItems: ['Floral'] },
  { id: 'fruity',         label: 'Frutal',           color: '#E8834A', subItems: ['Berry', 'Fruta Seca', 'Cítrico'] },
  { id: 'sweet',          label: 'Dulce',            color: '#B4874E', subItems: ['Vainilla/Vainillín', 'Azúcar moreno'] },
  { id: 'sour_fermented', label: 'Ácido/Fermentado', color: '#A83232', subItems: ['Ácido', 'Fermentado'] },
  { id: 'green_veg',      label: 'Verde/Vegetal',    color: '#6B8F71', subItems: ['Verde/Vegetal'] },
  { id: 'nutty_cocoa',    label: 'Nueces/Cacao',     color: '#8B7355', subItems: ['Nueces', 'Cacao'] },
  { id: 'spice',          label: 'Especia',          color: '#9B6B4A', subItems: ['Especia'] },
  { id: 'roasted',        label: 'Tostado',          color: '#5C4A32', subItems: ['Cereal', 'Quemado', 'Tabaco'] },
  { id: 'other',          label: 'Otro',             color: '#7A6E5F', subItems: ['Químico', 'Húmedo/Terroso', 'Madera'] },
] as const

export type FlavorFamilyId = (typeof FLAVOR_FAMILIES)[number]['id']

/* ============================================================
   NEW: Mouthfeel CATA (flat list)
   ============================================================ */
export const MOUTHFEEL_OPTIONS = [
  { id: 'rough',        label: 'Rugoso (Granuloso, Calcáreo, Arenoso)' },
  { id: 'oily',         label: 'Aceitoso' },
  { id: 'smooth',       label: 'Suave (Aterciopelado, Sedoso, Almíbar)' },
  { id: 'mouth_drying', label: 'Astringente (Boca Seca)' },
  { id: 'metallic',     label: 'Metálico' },
] as const

/* ============================================================
   NEW: Five basic tastes (structured)
   ============================================================ */
export const MAIN_TASTES = [
  { id: 'salty',  label: 'Salado' },
  { id: 'sour',   label: 'Ácido' },
  { id: 'sweet',  label: 'Dulce' },
  { id: 'bitter', label: 'Amargo' },
  { id: 'umami',  label: 'Umami' },
] as const

/* ============================================================
   NEW: Sensory defects (English IDs, Spanish display)
   ============================================================ */
export const SENSORY_DEFECTS = ['potato', 'moldy', 'phenolic'] as const
export type SensoryDefect = (typeof SENSORY_DEFECTS)[number]

export const SENSORY_DEFECT_LABELS: Record<SensoryDefect, string> = {
  potato:   'POTATO',
  moldy:    'MOLDY',
  phenolic: 'PHENOLIC',
}

/* ============================================================
   NEW: CATA selection limits per section
   ============================================================ */
export const CATA_MAX_SELECT: Partial<Record<CuppingSectionId, number>> = {
  fragrance: 5,
  aroma:     5,
  flavor:    5,
  mouthfeel: 2,
}

/* ============================================================
   EXISTING: Legacy data — kept for backward compatibility
   Used by PhysicalEvalForm, ExtrinsicForm, and other existing components
   ============================================================ */

export type DescriptorOption = { id: string; label: string };
export type FlavorNode = { id: string; label: string; subs: DescriptorOption[] };
export type MouthfeelNode = { id: string; label: string; subs: string[] };
export type DefectRow = { name: string; ratio: string };

export const FLAVOR_TREE: readonly FlavorNode[] = [
  { id: "floral", label: "Floral", subs: [] },
  {
    id: "afrutado",
    label: "Afrutado",
    subs: [
      { id: "bayas", label: "Bayas" },
      { id: "frutas_deshidratadas", label: "Frutas deshidratadas" },
      { id: "citricos", label: "Cítricos" },
    ],
  },
  {
    id: "acido_fermentado",
    label: "Ácido/Fermentado",
    subs: [
      { id: "acido_sub", label: "Ácido" },
      { id: "fermentado", label: "Fermentado" },
    ],
  },
  { id: "verde_vegetal", label: "Verde/Vegetal", subs: [] },
  {
    id: "otra",
    label: "Otra",
    subs: [
      { id: "quimico", label: "Químico" },
      { id: "humedad_tierra", label: "Humedad/Tierra" },
      { id: "madera", label: "Madera" },
    ],
  },
  {
    id: "tostado",
    label: "Tostado",
    subs: [
      { id: "cereal", label: "Cereal" },
      { id: "quemado", label: "Quemado" },
      { id: "tabaco", label: "Tabaco" },
    ],
  },
  {
    id: "nueces_cacao",
    label: "Nueces/Cacao",
    subs: [
      { id: "nueces", label: "Nueces" },
      { id: "cacao", label: "Cacao" },
    ],
  },
  { id: "especias", label: "Especias", subs: [] },
  {
    id: "dulce_desc",
    label: "Dulce",
    subs: [
      { id: "vainilla", label: "Vainilla" },
      { id: "azucar_morena", label: "Azúcar morena" },
    ],
  },
] as const;

export const ACIDITY_DESCRIPTORS: readonly DescriptorOption[] = [
  { id: "citrica", label: "Cítrica" },
  { id: "malica", label: "Málica (manzana verde)" },
  { id: "tartarica", label: "Tartárica (uva)" },
  { id: "fosforica", label: "Fosfórica (brillante)" },
  { id: "acetica", label: "Acética (vinagre)" },
  { id: "lactica", label: "Láctica (yogur)" },
  { id: "quinica", label: "Quínica (astringente)" },
] as const;

export const SWEETNESS_DESCRIPTORS: readonly DescriptorOption[] = [
  { id: "miel", label: "Miel" },
  { id: "panela", label: "Panela/Piloncillo" },
  { id: "caramelo", label: "Caramelo" },
  { id: "chocolate", label: "Chocolate" },
  { id: "frutal_dulce", label: "Frutal dulce" },
  { id: "melaza", label: "Melaza" },
  { id: "azucar_morena_d", label: "Azúcar morena" },
  { id: "vainilla_d", label: "Vainilla" },
] as const;

export const MOUTHFEEL_DESCRIPTORS: readonly MouthfeelNode[] = [
  { id: "aspero", label: "Áspero", subs: ["Arenoso", "Rugoso", "Rasposo"] },
  { id: "aceitoso", label: "Aceitoso", subs: ["Untuoso", "Cremoso"] },
  {
    id: "suave",
    label: "Suave",
    subs: ["Aterciopelado", "Sedoso", "Almibarado"],
  },
  {
    id: "astringente",
    label: "Deja seca la boca (astringente)",
    subs: [],
  },
  { id: "metalico", label: "Metálico", subs: [] },
] as const;

export const GUSTOS_PREDOMINANTES = [
  "Salado",
  "Ácido",
  "Dulce",
  "Amargo",
  "Umami",
] as const;

export const AFFECTIVE_ATTRIBUTES: readonly { id: string; label: string }[] = [
  { id: "fragancia_af", label: "Fragancia" },
  { id: "aroma_af", label: "Aroma" },
  { id: "sabor_af", label: "Sabor" },
  { id: "sabor_residual_af", label: "Sabor residual" },
  { id: "acidez_af", label: "Acidez" },
  { id: "dulzor_af", label: "Dulzor" },
  { id: "sensacion_af", label: "Sensación en boca" },
  { id: "impresion_global", label: "Impresión global" },
] as const;

export type CuppingPhase = "fragrance" | "aroma" | "liquoring";

export const PHASE_ATTRIBUTES: Record<
  CuppingPhase,
  { descriptiveId: string | null; affectiveId: string }[]
> = {
  fragrance: [{ descriptiveId: "fragancia", affectiveId: "fragancia_af" }],
  aroma:     [{ descriptiveId: "aroma",     affectiveId: "aroma_af" }],
  liquoring: [
    { descriptiveId: "sabor",          affectiveId: "sabor_af" },
    { descriptiveId: "sabor_residual", affectiveId: "sabor_residual_af" },
    { descriptiveId: "acidez",         affectiveId: "acidez_af" },
    { descriptiveId: "dulzor",         affectiveId: "dulzor_af" },
    { descriptiveId: "sensacion",      affectiveId: "sensacion_af" },
    { descriptiveId: null,             affectiveId: "impresion_global" },
  ],
};

export const PHASE_LABELS: Record<CuppingPhase, string> = {
  fragrance: "Fragancia",
  aroma:     "Aroma",
  liquoring: "En taza",
};

export const CUPPING_PHASES: CuppingPhase[] = ["fragrance", "aroma", "liquoring"];

export const DEFECT_TYPES = ["Mohoso", "Fenólico", "Papa"] as const;

export const GREEN_COLORS = [
  "Verde-azul",
  "Verde azulado",
  "Verde",
  "Verdoso",
  "Verde amarillento",
  "Amarillo pálido",
  "Amarillento",
  "Parduzco",
] as const;

export const CAT1_DEFECTS: readonly DefectRow[] = [
  { name: "Grano negro", ratio: "1:1" },
  { name: "Grano agrio", ratio: "1:1" },
  { name: "Cereza seca", ratio: "1:1" },
  { name: "Daño por hongos", ratio: "1:1" },
  { name: "Materia extraña", ratio: "1:1" },
  { name: "Daño por insecto grave", ratio: "5:1" },
] as const;

export const CAT2_DEFECTS: readonly DefectRow[] = [
  { name: "Grano negro parcial", ratio: "3:1" },
  { name: "Grano agrio parcial", ratio: "3:1" },
  { name: "Pergamino", ratio: "5:1" },
  { name: "Flotador", ratio: "5:1" },
  { name: "Inmaduro", ratio: "5:1" },
  { name: "Averanado", ratio: "5:1" },
  { name: "Concha", ratio: "5:1" },
  { name: "Partido/mordido/cortado", ratio: "5:1" },
  { name: "Cascarilla", ratio: "5:1" },
  { name: "Daño por insecto leve", ratio: "10:1" },
] as const;

export const SCREEN_SIZES = Array.from({ length: 14 }, (_, i) => i + 10);

export const CERTIFICATIONS = [
  "4C",
  "Comercio justo/Fairtrade",
  "Orgánico",
  "Rainforest Alliance",
  "Inocuidad alimentaria",
  "Otro",
] as const;

export const PROCESS_TYPES = [
  "Lavado",
  "Natural",
  "Honey",
  "Anaeróbico",
  "Maceración Carbónica",
  "Láctico",
  "Co-fermentación",
  "Otro",
] as const;

export function getRatio(ratioStr: string): number {
  const [beans, defect] = ratioStr.split(":").map(Number);
  return beans / defect;
}
