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
   NEW: Flavor wheel — strict 3-level tree (WCR/SCA Coffee Taster's
   Flavor Wheel). Level 1 (group) → Level 2 (subgroup) → Level 3
   (descriptor). Single source of truth for the flavor CATA in both
   the Descriptive and Combined forms.

   IDs are colon-delimited English-key paths and are STABLE in stored
   JSON (e.g. "fruity", "fruity:berry", "fruity:berry:blackberry").
   Display labels are bilingual (label_es / label_en).
   ============================================================ */
export type FlavorLevel = 1 | 2 | 3
export type FlavorWheelNode = {
  id: string
  level: FlavorLevel
  parentId: string | null
  label_es: string
  label_en: string
  color?: string // present only on L1 groups; descendants inherit via flavorGroupColor()
}

// Authoring shape — flattened below into FLAVOR_WHEEL nodes so parentId/level
// never drift from the nesting.
type RawLeaf = { key: string; es: string; en: string }
type RawSub = { key: string; es: string; en: string; leaves?: RawLeaf[] }
type RawGroup = { key: string; es: string; en: string; color: string; subs: RawSub[] }

const FLAVOR_WHEEL_SOURCE: RawGroup[] = [
  { key: 'floral', es: 'Floral', en: 'Floral', color: '#C17817', subs: [
    { key: 'black_tea', es: 'Té negro', en: 'Black Tea' },
    { key: 'floral', es: 'Floral', en: 'Floral', leaves: [
      { key: 'chamomile', es: 'Manzanilla', en: 'Chamomile' },
      { key: 'jasmine',   es: 'Jazmín',     en: 'Jasmine' },
      { key: 'rose',      es: 'Rosa',        en: 'Rose' },
    ] },
  ] },
  { key: 'fruity', es: 'Frutal', en: 'Fruity', color: '#E8834A', subs: [
    { key: 'berry', es: 'Bayas', en: 'Berry', leaves: [
      { key: 'blackberry', es: 'Mora',      en: 'Blackberry' },
      { key: 'blueberry',  es: 'Arándano',  en: 'Blueberry' },
      { key: 'raspberry',  es: 'Frambuesa', en: 'Raspberry' },
      { key: 'strawberry', es: 'Fresa',     en: 'Strawberry' },
    ] },
    { key: 'citrus', es: 'Cítrico', en: 'Citrus Fruit', leaves: [
      { key: 'grapefruit', es: 'Toronja', en: 'Grapefruit' },
      { key: 'lemon',      es: 'Limón',   en: 'Lemon' },
      { key: 'lime',       es: 'Lima',    en: 'Lime' },
      { key: 'orange',     es: 'Naranja', en: 'Orange' },
    ] },
    { key: 'dried', es: 'Fruta deshidratada', en: 'Dried Fruit', leaves: [
      { key: 'prune',  es: 'Ciruela pasa', en: 'Prune' },
      { key: 'raisin', es: 'Pasa',          en: 'Raisin' },
    ] },
    { key: 'other_fruit', es: 'Otra fruta', en: 'Other Fruit', leaves: [
      { key: 'apple',       es: 'Manzana', en: 'Apple' },
      { key: 'cherry',      es: 'Cereza',  en: 'Cherry' },
      { key: 'coconut',     es: 'Coco',    en: 'Coconut' },
      { key: 'grape',       es: 'Uva',     en: 'Grape' },
      { key: 'peach',       es: 'Durazno', en: 'Peach' },
      { key: 'pear',        es: 'Pera',    en: 'Pear' },
      { key: 'pineapple',   es: 'Piña',    en: 'Pineapple' },
      { key: 'pomegranate', es: 'Granada', en: 'Pomegranate' },
    ] },
  ] },
  // ⚠ Green/Vegetal: Kim asked for fresco/seco/cocido instead of the wheel's
  // Beany/Green-Vegetative/Raw. The L3 distribution below is a proposed default
  // and needs Kim's sign-off before it is considered final.
  { key: 'green_veg', es: 'Verde/Vegetal', en: 'Green/Vegetative', color: '#6B8F71', subs: [
    { key: 'fresh', es: 'Vegetal fresco', en: 'Fresh Vegetative', leaves: [
      { key: 'fresh',       es: 'Fresco',            en: 'Fresh' },
      { key: 'peapod',      es: 'Vaina de guisante', en: 'Peapod' },
      { key: 'vegetative',  es: 'Vegetal',           en: 'Vegetative' },
      { key: 'dark_green',  es: 'Verde oscuro',      en: 'Dark Green' },
      { key: 'herb_like',   es: 'Herbáceo',          en: 'Herb-like' },
      { key: 'cucumber',    es: 'Pepino',            en: 'Cucumber' },
      { key: 'under_ripe',  es: 'Inmaduro',          en: 'Under-ripe' },
    ] },
    { key: 'dried', es: 'Vegetal seco', en: 'Dried Vegetative', leaves: [
      { key: 'hay_like',     es: 'Heno',         en: 'Hay-like' },
      { key: 'beany',        es: 'Leguminoso',   en: 'Beany' },
      { key: 'raw',          es: 'Crudo',        en: 'Raw' },
      { key: 'potato_skins', es: 'Piel de papa', en: 'Potato Skins' },
    ] },
    { key: 'cooked', es: 'Vegetal cocido', en: 'Cooked Vegetative', leaves: [
      { key: 'olive_oil', es: 'Aceite de oliva', en: 'Olive Oil' },
    ] },
  ] },
  { key: 'nutty_cocoa', es: 'Nueces/Cacao', en: 'Nutty/Cocoa', color: '#8B7355', subs: [
    { key: 'cocoa', es: 'Cacao', en: 'Cocoa', leaves: [
      { key: 'chocolate',      es: 'Chocolate',        en: 'Chocolate' },
      { key: 'dark_chocolate', es: 'Chocolate amargo', en: 'Dark Chocolate' },
    ] },
    { key: 'nutty', es: 'Nueces', en: 'Nutty', leaves: [
      { key: 'almond',   es: 'Almendra',  en: 'Almond' },
      { key: 'hazelnut', es: 'Avellana',  en: 'Hazelnut' },
      { key: 'nutty',    es: 'Nuez',      en: 'Nutty' },
      { key: 'peanuts',  es: 'Cacahuate', en: 'Peanuts' },
    ] },
  ] },
  // ⚠ Spices: keep Pungent/Pepper/Spicy as subgroups (extensible, no L3 on the
  // wheel yet) while applying Kim's Spanish labels. Needs Kim's sign-off.
  { key: 'spice', es: 'Especiado', en: 'Spices', color: '#9B6B4A', subs: [
    { key: 'brown_spice', es: 'Especias dulces', en: 'Brown Spice', leaves: [
      { key: 'anise',       es: 'Anís',         en: 'Anise' },
      { key: 'brown_spice', es: 'Especia dulce', en: 'Brown Spice' },
      { key: 'cinnamon',    es: 'Canela',        en: 'Cinnamon' },
      { key: 'clove',       es: 'Clavo',         en: 'Clove' },
      { key: 'nutmeg',      es: 'Nuez moscada',  en: 'Nutmeg' },
    ] },
    { key: 'pungent', es: 'Especias secas',     en: 'Pungent' },
    { key: 'pepper',  es: 'Especias picantes',  en: 'Pepper' },
    { key: 'spicy',   es: 'Especiado picante',  en: 'Spicy' },
  ] },
  { key: 'roasted', es: 'Tostado', en: 'Roasted', color: '#5C4A32', subs: [
    { key: 'burnt', es: 'Quemado', en: 'Burnt', leaves: [
      { key: 'acrid',       es: 'Acre',        en: 'Acrid' },
      { key: 'ashy',        es: 'Ceniza',      en: 'Ashy' },
      { key: 'brown_roast', es: 'Tueste medio', en: 'Brown-Roast' },
      { key: 'burnt',       es: 'Quemado',     en: 'Burnt' },
      { key: 'smoky',       es: 'Ahumado',     en: 'Smoky' },
    ] },
    { key: 'cereal', es: 'Cereal', en: 'Cereal', leaves: [
      { key: 'cereal', es: 'Cereal', en: 'Cereal' },
      { key: 'grain',  es: 'Grano',  en: 'Grain' },
      { key: 'malt',   es: 'Malta',  en: 'Malt' },
    ] },
    { key: 'tobacco', es: 'Tabaco', en: 'Tobacco', leaves: [
      { key: 'pipe_tobacco', es: 'Tabaco de pipa', en: 'Pipe Tobacco' },
      { key: 'tobacco',      es: 'Tabaco',          en: 'Tobacco' },
    ] },
  ] },
  { key: 'sweet', es: 'Dulce', en: 'Sweet', color: '#B4874E', subs: [
    { key: 'brown_sugar', es: 'Azúcar moreno', en: 'Brown Sugar', leaves: [
      { key: 'caramelized', es: 'Caramelizado',   en: 'Caramelized' },
      { key: 'honey',       es: 'Miel',            en: 'Honey' },
      { key: 'maple_syrup', es: 'Sirope de arce',  en: 'Maple Syrup' },
      { key: 'molasses',    es: 'Melaza',          en: 'Molasses' },
    ] },
    { key: 'sweet_aromatics', es: 'Aromáticos dulces', en: 'Sweet Aromatics', leaves: [
      { key: 'overall_sweet', es: 'Dulce general', en: 'Overall Sweet' },
      { key: 'vanilla',       es: 'Vainilla',      en: 'Vanilla' },
      { key: 'vanillin',      es: 'Vainillina',    en: 'Vanillin' },
    ] },
  ] },
  { key: 'sour_fermented', es: 'Ácido/Fermentado', en: 'Sour/Fermented', color: '#A83232', subs: [
    { key: 'alcohol_fermented', es: 'Alcohol/Fermentado', en: 'Alcohol/Fermented', leaves: [
      { key: 'fermented', es: 'Fermentado', en: 'Fermented' },
      { key: 'overripe',  es: 'Sobremaduro', en: 'Overripe' },
      { key: 'whiskey',   es: 'Whisky',      en: 'Whiskey' },
      { key: 'winey',     es: 'Vinoso',      en: 'Winey' },
    ] },
    { key: 'sour', es: 'Ácido', en: 'Sour', leaves: [
      { key: 'acetic',         es: 'Acético',          en: 'Acetic' },
      { key: 'butyric',        es: 'Butírico',         en: 'Butyric' },
      { key: 'citric',         es: 'Cítrico',          en: 'Citric' },
      { key: 'isovaleric',     es: 'Isovalérico',      en: 'Isovaleric' },
      { key: 'malic',          es: 'Málico',           en: 'Malic' },
      { key: 'sour_aromatics', es: 'Aromáticos ácidos', en: 'Sour Aromatics' },
    ] },
  ] },
  { key: 'other', es: 'Otros', en: 'Other', color: '#7A6E5F', subs: [
    { key: 'chemical', es: 'Químico', en: 'Chemical', leaves: [
      { key: 'bitter',    es: 'Amargo',    en: 'Bitter' },
      { key: 'medicinal', es: 'Medicinal', en: 'Medicinal' },
      { key: 'petroleum', es: 'Petróleo',  en: 'Petroleum' },
      { key: 'rubber',    es: 'Goma',      en: 'Rubber' },
      { key: 'salty',     es: 'Salado',    en: 'Salty' },
      { key: 'skunky',    es: 'Apestoso',  en: 'Skunky' },
    ] },
    { key: 'papery_musty', es: 'Papel/Mohoso', en: 'Papery/Musty', leaves: [
      { key: 'animalic',     es: 'Animal',         en: 'Animalic' },
      { key: 'cardboard',    es: 'Cartón',         en: 'Cardboard' },
      { key: 'meaty_brothy', es: 'Cárnico',        en: 'Meaty/Brothy' },
      { key: 'moldy_damp',   es: 'Mohoso húmedo',  en: 'Moldy/Damp' },
      { key: 'musty_dusty',  es: 'Polvoriento',    en: 'Musty/Dusty' },
      { key: 'musty_earthy', es: 'Terroso',        en: 'Musty/Earthy' },
      { key: 'papery',       es: 'Papel',          en: 'Papery' },
      { key: 'phenolic',     es: 'Fenólico',       en: 'Phenolic' },
      { key: 'stale',        es: 'Rancio',         en: 'Stale' },
      { key: 'woody',        es: 'Madera',         en: 'Woody' },
    ] },
  ] },
]

// Flatten the authoring source into the canonical flat node array.
export const FLAVOR_WHEEL: readonly FlavorWheelNode[] = (() => {
  const nodes: FlavorWheelNode[] = []
  for (const g of FLAVOR_WHEEL_SOURCE) {
    nodes.push({ id: g.key, level: 1, parentId: null, label_es: g.es, label_en: g.en, color: g.color })
    for (const sub of g.subs) {
      const subId = `${g.key}:${sub.key}`
      nodes.push({ id: subId, level: 2, parentId: g.key, label_es: sub.es, label_en: sub.en })
      for (const leaf of sub.leaves ?? []) {
        nodes.push({ id: `${subId}:${leaf.key}`, level: 3, parentId: subId, label_es: leaf.es, label_en: leaf.en })
      }
    }
  }
  return nodes
})()

const FLAVOR_NODE_BY_ID = new Map(FLAVOR_WHEEL.map((n) => [n.id, n]))

/** Look up a flavor node by id. */
export function flavorNodeById(id: string): FlavorWheelNode | undefined {
  return FLAVOR_NODE_BY_ID.get(id)
}

/** Direct children of a node (pass null for the L1 groups). Drives modal nav. */
export function flavorChildren(parentId: string | null): FlavorWheelNode[] {
  return FLAVOR_WHEEL.filter((n) => n.parentId === parentId)
}

/** Climb to the L1 group and return its color (descendants inherit it). */
export function flavorGroupColor(id: string): string {
  let node = FLAVOR_NODE_BY_ID.get(id)
  while (node && node.parentId) node = FLAVOR_NODE_BY_ID.get(node.parentId)
  return node?.color ?? '#7A6E5F'
}

/**
 * Read-time migration for descriptor ids whose path changed in the 3-level
 * restructure. Stored evaluation JSON is never rewritten; resolveDescriptor and
 * the form loaders alias old → new ids so existing saved sessions keep working.
 */
export const FLAVOR_ID_MIGRATION: Record<string, string> = {
  'sweet:vanilla':            'sweet:sweet_aromatics',
  'sour_fermented:fermented': 'sour_fermented:alcohol_fermented',
  'roasted:burned':           'roasted:burnt',
  'other:earthy':             'other:papery_musty',
  'other:wood':               'other:papery_musty',
}

/** Apply the flavor id migration alias (returns the id unchanged if none). */
export function migrateFlavorId(id: string): string {
  return FLAVOR_ID_MIGRATION[id] ?? id
}

/* ============================================================
   Back-compat 2-level view derived from FLAVOR_WHEEL.
   Existing consumers (PrintClient, MyResultsSummary, landing) import
   FLAVOR_FAMILIES with the legacy { id, label, color, subItems } shape.
   Spanish labels, L1 groups + their L2 subgroups.
   ============================================================ */
export type FlavorFamily = {
  id: string
  label: string
  color: string
  subItems: readonly { id: string; label: string }[]
}

export const FLAVOR_FAMILIES: readonly FlavorFamily[] = FLAVOR_WHEEL_SOURCE.map((g) => ({
  id: g.key,
  label: g.es,
  color: g.color,
  subItems: g.subs.map((sub) => ({ id: `${g.key}:${sub.key}`, label: sub.es })),
}))

export type FlavorFamilyId = string

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
export type MouthfeelNode = { id: string; label: string; subs: string[] };
export type DefectRow = { name: string; ratio: string };

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

export type CuppingPhase =
  | "fragrance" | "aroma" | "flavor"
  | "acidity"  | "sweetness" | "mouthfeel" | "overall";

export const PHASE_ATTRIBUTES: Record<
  CuppingPhase,
  { descriptiveId: string | null; affectiveId: string }[]
> = {
  fragrance: [{ descriptiveId: "fragancia",      affectiveId: "fragancia_af" }],
  aroma:     [{ descriptiveId: "aroma",          affectiveId: "aroma_af" }],
  flavor:    [
    { descriptiveId: "sabor",          affectiveId: "sabor_af" },
    { descriptiveId: "sabor_residual", affectiveId: "sabor_residual_af" },
  ],
  acidity:   [{ descriptiveId: "acidez",    affectiveId: "acidez_af" }],
  sweetness: [{ descriptiveId: "dulzor",    affectiveId: "dulzor_af" }],
  mouthfeel: [{ descriptiveId: "sensacion", affectiveId: "sensacion_af" }],
  overall:   [{ descriptiveId: null,        affectiveId: "impresion_global" }],
};

export const PHASE_LABELS: Record<CuppingPhase, string> = {
  fragrance: "Fragancia",
  aroma:     "Aroma",
  flavor:    "Sabor/Regusto",
  acidity:   "Acidez",
  sweetness: "Dulzor",
  mouthfeel: "Sensación",
  overall:   "Global",
};

export const CUPPING_PHASES: CuppingPhase[] = [
  "fragrance", "aroma", "flavor", "acidity", "sweetness", "mouthfeel", "overall",
];

/* ============================================================
   NEW: 4-step CVA flow (replaces 7-phase model in UI)
   - Descriptive uses 3 steps (no overall affective scoring)
   - Affective and Combined use all 4 steps
   ============================================================ */
export type CuppingStep =
  | "fragrance"
  | "aroma"
  | "taste_aftertaste"
  | "acidity_sweetness_mouthfeel"
  | "overall";

export const CUPPING_STEPS: CuppingStep[] = [
  "fragrance",
  "aroma",
  "taste_aftertaste",
  "acidity_sweetness_mouthfeel",
  "overall",
];

export const DESCRIPTIVE_STEPS: CuppingStep[] = [
  "fragrance",
  "aroma",
  "taste_aftertaste",
  "acidity_sweetness_mouthfeel",
];

export const STEP_LABELS: Record<CuppingStep, string> = {
  fragrance: "Fragancia",
  aroma: "Aroma",
  taste_aftertaste: "Sabor y Regusto",
  acidity_sweetness_mouthfeel: "Acidez, Dulzor y Sensación",
  overall: "Global",
};

export const STEP_LABELS_SHORT: Record<CuppingStep, string> = {
  fragrance: "Fragancia",
  aroma: "Aroma",
  taste_aftertaste: "Sabor / Regusto",
  acidity_sweetness_mouthfeel: "Acidez / Dulzor",
  overall: "Global",
};

/** Attributes covered by each step. Same shape as PHASE_ATTRIBUTES. */
export const STEP_ATTRIBUTES: Record<
  CuppingStep,
  { descriptiveId: string | null; affectiveId: string }[]
> = {
  fragrance: [
    { descriptiveId: "fragancia", affectiveId: "fragancia_af" },
  ],
  aroma: [
    { descriptiveId: "aroma", affectiveId: "aroma_af" },
  ],
  taste_aftertaste: [
    { descriptiveId: "sabor",          affectiveId: "sabor_af" },
    { descriptiveId: "sabor_residual", affectiveId: "sabor_residual_af" },
  ],
  acidity_sweetness_mouthfeel: [
    { descriptiveId: "acidez",    affectiveId: "acidez_af" },
    { descriptiveId: "dulzor",    affectiveId: "dulzor_af" },
    { descriptiveId: "sensacion", affectiveId: "sensacion_af" },
  ],
  overall: [
    { descriptiveId: null, affectiveId: "impresion_global" },
  ],
};

export const STEP_DESC_LABELS: Record<string, string> = {
  fragancia:       "Fragancia",
  aroma:           "Aroma",
  sabor:           "Sabor",
  sabor_residual:  "Sabor Residual (Regusto)",
  acidez:          "Acidez",
  dulzor:          "Dulzor",
  sensacion:       "Sensación en Boca",
};

/* ============================================================
   NEW: Acidity / Sweetness / Mouthfeel CATA descriptor sets
   English IDs (stable in JSON), Spanish display labels.
   ============================================================ */
export const ACIDITY_CATA = [
  { id: "acidity:juicy",      label: "Jugosa",     color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
  { id: "acidity:fruit_like", label: "Afrutada",   color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
  { id: "acidity:bright",     label: "Brillante",  color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
  { id: "acidity:tart",       label: "Astringente", color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
  { id: "acidity:sharp",      label: "Aguda",      color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
  { id: "acidity:winey",      label: "Vinosa",     color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
  { id: "acidity:vinegary",   label: "Avinagrada", color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
  { id: "acidity:herbal",     label: "Herbal",     color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
  { id: "acidity:grassy",     label: "Herbácea",   color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
  { id: "acidity:dry",        label: "Seca",       color: "#A83232", subItems: [] as readonly { id: string; label: string }[] },
] as const;

export const SWEETNESS_CATA = [
  { id: "sweetness:vanilla",      label: "Vainilla", color: "#B4874E",
    subItems: [] },
  { id: "sweetness:brown_sugar",  label: "Azúcar moreno", color: "#8B7355",
    subItems: [
      { id: "sweetness:honey",         label: "Miel" },
      { id: "sweetness:caramelized",   label: "Caramelizado" },
      { id: "sweetness:maple_syrup",   label: "Sirope de arce" },
      { id: "sweetness:molasses",      label: "Melaza" },
    ] },
] as const;

export const MOUTHFEEL_CATA = [
  { id: "mouthfeel:rough",        label: "Rugoso", color: "#7A6E5F",
    subItems: [
      { id: "mouthfeel:gritty", label: "Granuloso" },
      { id: "mouthfeel:chalky", label: "Calcáreo" },
      { id: "mouthfeel:sandy",  label: "Arenoso" },
    ] },
  { id: "mouthfeel:oily",         label: "Aceitoso", color: "#C17817",
    subItems: [] },
  { id: "mouthfeel:smooth",       label: "Suave", color: "#6B8F71",
    subItems: [
      { id: "mouthfeel:velvety", label: "Aterciopelado" },
      { id: "mouthfeel:silky",   label: "Sedoso" },
      { id: "mouthfeel:syrupy",  label: "Almíbar" },
    ] },
  { id: "mouthfeel:mouth_drying", label: "Astringente", color: "#A83232",
    subItems: [] },
  { id: "mouthfeel:metallic",     label: "Metálico", color: "#5C4A32",
    subItems: [] },
] as const;

/** Max selections per CATA section in the new step model. */
export const STEP_CATA_MAX: Record<string, number> = {
  fragancia:      5,
  aroma:          5,
  sabor:          5,
  sabor_residual: 5,
  acidez:         3,
  dulzor:         3,
  sensacion:      2,
};

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
