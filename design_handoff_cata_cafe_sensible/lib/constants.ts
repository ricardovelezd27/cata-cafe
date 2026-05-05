/**
 * Cata Café Sensible — SCA CVA constants
 * Single source of truth for cupping protocol data.
 */

/* ============================================================
   Cupping sections (chronological order of CVA protocol)
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
   Affective scale (1–9) labels
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
  1: 'Extr. bajo', 2: 'Muy bajo', 3: 'Mod. bajo',
  4: 'Lig. bajo',  5: 'Neutro',   6: 'Lig. alto',
  7: 'Mod. alto',  8: 'Muy alto', 9: 'Extr. alto',
}

/* ============================================================
   CATA flavor families (with sub-descriptors)
   ============================================================ */
export const FLAVOR_FAMILIES = [
  { id: 'floral',         label: 'Floral',            color: '#C17817', subItems: ['Floral'] },
  { id: 'fruity',         label: 'Frutal',            color: '#E8834A', subItems: ['Berry', 'Fruta Seca', 'Cítrico'] },
  { id: 'sweet',          label: 'Dulce',             color: '#B4874E', subItems: ['Vainilla/Vainillín', 'Azúcar moreno'] },
  { id: 'sour_fermented', label: 'Ácido/Fermentado',  color: '#A83232', subItems: ['Ácido', 'Fermentado'] },
  { id: 'green_veg',      label: 'Verde/Vegetal',     color: '#6B8F71', subItems: ['Verde/Vegetal'] },
  { id: 'nutty_cocoa',    label: 'Nueces/Cacao',      color: '#8B7355', subItems: ['Nueces', 'Cacao'] },
  { id: 'spice',          label: 'Especia',           color: '#9B6B4A', subItems: ['Especia'] },
  { id: 'roasted',        label: 'Tostado',           color: '#5C4A32', subItems: ['Cereal', 'Quemado', 'Tabaco'] },
  { id: 'other',          label: 'Otro',              color: '#7A6E5F', subItems: ['Químico', 'Húmedo/Terroso', 'Madera'] },
] as const

export type FlavorFamilyId = (typeof FLAVOR_FAMILIES)[number]['id']

/* ============================================================
   Mouthfeel CATA
   ============================================================ */
export const MOUTHFEEL_OPTIONS = [
  { id: 'rough',        label: 'Rugoso (Granuloso, Calcáreo, Arenoso)' },
  { id: 'oily',         label: 'Aceitoso' },
  { id: 'smooth',       label: 'Suave (Aterciopelado, Sedoso, Almíbar)' },
  { id: 'mouth_drying', label: 'Astringente (Boca Seca)' },
  { id: 'metallic',     label: 'Metálico' },
] as const

/* ============================================================
   Five basic tastes
   ============================================================ */
export const MAIN_TASTES = [
  { id: 'salty',  label: 'Salado' },
  { id: 'sour',   label: 'Ácido' },
  { id: 'sweet',  label: 'Dulce' },
  { id: 'bitter', label: 'Amargo' },
  { id: 'umami',  label: 'Umami' },
] as const

/* ============================================================
   Sensory defects
   ============================================================ */
export const SENSORY_DEFECTS = ['potato', 'moldy', 'phenolic'] as const
export type SensoryDefect = (typeof SENSORY_DEFECTS)[number]

export const SENSORY_DEFECT_LABELS: Record<SensoryDefect, string> = {
  potato:   'POTATO',
  moldy:    'MOLDY',
  phenolic: 'PHENOLIC',
}

/* ============================================================
   Process types
   ============================================================ */
export const PROCESS_TYPES = [
  'Lavado',
  'Natural',
  'Honey',
  'Anaeróbico',
  'Maceración Carbónica',
  'Láctico',
  'Co-fermentación',
  'Otro',
] as const

/* ============================================================
   CATA selection limits per section
   ============================================================ */
export const CATA_MAX_SELECT: Partial<Record<CuppingSectionId, number>> = {
  fragrance: 5,
  aroma:     5,
  flavor:    5,
  mouthfeel: 2,
}
