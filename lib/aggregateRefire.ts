// S8-04 (F-solo-2, F-offline-7). Pure rules for keeping the stored community
// aggregate (aggregate_scores, written ONLY by trg_recompute_aggregate) in step
// with an evaluation edited after it was submitted.
//
// The trigger fires `AFTER INSERT OR UPDATE OF "isDraft"` when NEW."isDraft" =
// false. An edit of a submitted row that does not name "isDraft" in its SET list
// never fires it, so history/coffee profile (which read the STORED aggregate)
// kept the pre-edit score. The fix (architect design b): after the upsert, run
// ONE guarded no-op write that names isDraft only for rows that are already
// submitted. Draft saves (the 800 ms hot path) match nothing and fire nothing.
// Dependency-free so tests/aggregateRefire.test.ts can import it.

export function submittedRefireArgs(evaluationId: string): {
  where: { id: string; isDraft: false };
  data: { isDraft: false };
} {
  return { where: { id: evaluationId, isDraft: false }, data: { isDraft: false } };
}

/**
 * Offline replay over an existing row. `existingIsDraft` null = no row.
 * Group rules are untouched (conflict unless forced). Solo: one person, nobody
 * else's data, so a replay over the owner's own submitted row applies.
 */
export function replayOverExisting(input: {
  existingIsDraft: boolean | null;
  force: boolean;
  isGroup: boolean;
}): "apply" | "conflict" {
  if (input.existingIsDraft !== false) return "apply";
  if (input.force) return "apply";
  return input.isGroup ? "conflict" : "apply";
}
