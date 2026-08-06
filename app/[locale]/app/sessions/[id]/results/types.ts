// Shared result-page data shapes — extracted out of ResultsClient.tsx so the
// Phase 3 drill-down components (and ResumenTab) can import the same types
// instead of redeclaring them.

export type AggregateScoreData = {
  communityScore: number | null;
  avgRawScore: number | null;
  participantCount: number;
  submittedCount: number;
  totalCups: number;
  totalNonUniform: number;
  totalDefective: number;
  uniformityPenalty: number;
  defectPenalty: number;
  attrAverages: Record<string, number>;
};

export type CoffeeInfo = {
  name: string;
  country: string | null;
  region: string | null;
  producer: string | null;
  variety: string | null;
  altitude: string | null;
  roastLevel: string | null;
};

export type SampleCoffee = {
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  processType: string;
  altitude: string;
  roastLevel: string;
};

export type SampleResult = {
  id: string;
  label: string;
  revealed: boolean;
  coffee: CoffeeInfo | null;
  masterCoffee: SampleCoffee | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  physical: Record<string, unknown>;
  extrinsic: Record<string, unknown>;
  aggregateScore: AggregateScoreData | null;
};

// In-app help (InfoHint) content — one title/body pair per help topic. Shared
// by ResultsClient and every tab it feeds, so the shape mirrors the
// `results.help.*` i18n namespace 1:1.
export type HelpTopic = { title: string; body: string };

export type ResultsHelp = {
  closeLabel: string;
  stats: HelpTopic;
  ranking: HelpTopic;
  performance: HelpTopic;
  highlights: HelpTopic;
  tabla: HelpTopic;
  grafico: HelpTopic;
  porCatador: HelpTopic;
  filtros: HelpTopic;
  nube: HelpTopic;
  frecuencia: HelpTopic;
  alineacion: HelpTopic;
};
