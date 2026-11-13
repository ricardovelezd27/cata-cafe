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

// "closed_unsent" (S8-05): the session closed (or its deadline passed) before
// this module reached the server. The draft stays on the device, read-only,
// counted by the pending badge and named in a persistent notice; it is never
// replayed and never deleted without the cupper's say-so.
//
// S8-09 widens the machine (lib/offline/status.ts owns the transitions):
// "revealed_unsent" (S10 WP3a review M3/M4): the sample was REVEALED on a session that is
// still open, so the note typed after the reveal was refused. Same handling as closed_unsent
// (kept, read-only, never retried, never blocks submit) but its own wording, and it must NEVER
// be offered a send action: TODO for the late-contributions PR (acceptLateEvaluation /
// submitLateDraft): do NOT wire "Enviar al organizador" for this status.
//
//   failed   : replay kept failing (5 automatic attempts); the cupper retries by hand
//   orphaned : the sample or session no longer exists for this user (deleted
//              session, removed sample, lost membership); kept readable
export type SyncStatus =
  | "pending"
  | "synced"
  | "conflict"
  | "failed"
  | "closed_unsent"
  | "revealed_unsent"
  | "orphaned";

export type OfflineModuleData = {
  data: Data;
  syncStatus: SyncStatus;
  updatedAt: number;
  /** Consecutive failed replay runs (S8-09). Absent = 0. */
  attempts?: number;
  /** When the next automatic attempt is due (epoch ms, S8-09). */
  nextAttemptAt?: number;
  /** Replay answered "pending" (live session not started): no timed retry (S8-09). */
  waiting?: boolean;
  /** S10 WP5b review H1: this module was produced while the sample was the pinned
   *  reference, so its pinned keys are not the cupper's input. Sent with the replay;
   *  the server keeps the stored ratings for them if the sample is not pinned any more. */
  pinnedView?: boolean;
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
