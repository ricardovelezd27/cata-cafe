// Maps the ActionResult of a replayed upsertExtrinsic/upsertPhysical to the
// outcome the offline queue acts on. Pure so it is unit-tested (S8-12 review).
//   "synced" -> clear the pending flag
//   "retry"  -> treat exactly like a thrown error (backoff + eventually "failed")
// A closed/expired session is non-retryable: the server keeps its data and the
// draft can never apply, same as the evaluation path's "discarded" -> synced.
import type { ActionResult } from "@/lib/actionResult";

export function replayOutcomeFromResult(r: ActionResult<unknown>): "synced" | "retry" {
  if (r.ok) return "synced";
  return r.error === "session_closed" ? "synced" : "retry";
}
