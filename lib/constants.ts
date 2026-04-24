// Reference data ported verbatim from the v1 single-file app.
// Labels stay in Spanish; translations happen in the UI layer via next-intl.

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

export const AFFECTIVE_LABELS = [
  "Extremadamente baja",
  "Muy baja",
  "Moderadamente baja",
  "Ligeramente baja",
  "Ni alta ni baja",
  "Ligeramente alta",
  "Moderadamente alta",
  "Muy alta",
  "Extremadamente alta",
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
  "Otro",
] as const;

export function getRatio(ratioStr: string): number {
  const [beans, defect] = ratioStr.split(":").map(Number);
  return beans / defect;
}
