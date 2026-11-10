// S8-16. Pure, dependency-free builder for the snapshot stored on a LABEL-ONLY
// (coffeeId NULL) user_coffee_history row. Anonymity rule: a label-only row of
// a never-revealed sample carries no coffee name, id, farm, producer, origin or
// community score, in the row or its snapshot. The builder reads ONLY the
// sample's `label`, so a sample object that also carries a coffee cannot leak.

export type HistorySnapshot = {
  v: 1;
  sessionName: string;
  format: string;
  date: string;
  cupsPerSample: number;
  sampleLabel: string;
  /** Label-only row of a never-revealed sample (S8-16). Carries NO coffee field. */
  unrevealed?: true;
  /** Only THIS cupper's own module data — never another participant's. */
  myEvaluation: {
    descriptive: unknown;
    affective: unknown;
    combined: unknown;
  };
};

/** Exact key whitelist of a label-row snapshot (tests pin it). */
export const LABEL_SNAPSHOT_KEYS = [
  "v",
  "sessionName",
  "format",
  "date",
  "cupsPerSample",
  "sampleLabel",
  "unrevealed",
  "myEvaluation",
] as const;

export function buildLabelSnapshot(
  session: { name: string; format: string; date: Date; cupsPerSample: number },
  sample: { label: string },
  ev: { descriptiveData: unknown; affectiveData: unknown; combinedData: unknown },
  unrevealed: boolean,
): HistorySnapshot {
  return {
    v: 1,
    sessionName: session.name,
    format: session.format,
    date: session.date.toISOString(),
    cupsPerSample: session.cupsPerSample,
    sampleLabel: sample.label,
    ...(unrevealed ? { unrevealed: true as const } : {}),
    myEvaluation: {
      descriptive: ev.descriptiveData,
      affective: ev.affectiveData,
      combined: ev.combinedData,
    },
  };
}
