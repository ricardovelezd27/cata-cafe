// Shared types for the offline persistence + sync layer.
// Pure types only — safe to import from server or client.

export type Data = Record<string, unknown>;

// Per-cupper evaluation modules that can be edited offline. `descriptive`,
// `affective`, `combined` map to Evaluation JSON columns and go through the
// conflict-aware syncEvaluation action. `physical`/`extrinsic` are sample-wide
// (one row per sample) and replay last-write-wins through their own actions.
export type ModuleKey =
  | "descriptive"
  | "affective"
  | "combined"
  | "physical"
  | "extrinsic";

export const EVALUATION_MODULES: ModuleKey[] = [
  "descriptive",
  "affective",
  "combined",
];

export type SyncStatus = "pending" | "synced" | "conflict";

export type OfflineModuleData = {
  data: Data;
  syncStatus: SyncStatus;
  updatedAt: number;
};

export type OfflineSampleData = {
  label: string;
  modules: Partial<Record<ModuleKey, OfflineModuleData>>;
};

// The full local snapshot of one participant's work in one session. Persisted
// under `cata_session_{sessionId}_user_{userId}`.
export type OfflineSessionBlob = {
  sessionId: string;
  userId: string;
  updatedAt: number;
  format: string;
  cupsPerSample: number;
  samples: Record<string, OfflineSampleData>;
};

// One module flagged for the conflict modal: the server already holds a
// SUBMITTED (isDraft=false) evaluation for this sample, so the user must choose
// keep-submitted vs replace-with-local.
export type SyncConflict = {
  sessionId: string;
  userId: string;
  sampleId: string;
  sampleLabel: string;
  moduleKey: ModuleKey;
  cupsPerSample: number;
};
