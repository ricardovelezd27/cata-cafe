// Pure merge of the cup screen's local sample list with a fresh server list
// (S6 CP-C4). `CupClient` keeps `samples` in state (evaluation drafts live
// there), so a `router.refresh()` alone can never show a sample the owner
// added or renamed mid-session — this merge applies the server's metadata
// without touching the cupper's local evaluation data.
//
// Rules: a sample that exists locally keeps its LOCAL evaluation fields
// (local wins — an unsaved edit must never be overwritten by a refresh) and
// takes the server's label / position / coffee / revealed; a sample the
// server added is taken whole; a sample the server removed is dropped.
// The result is in position order with the reference first.

import { orderReferenceFirst } from "@/lib/referenceRules";

type SampleMeta = {
  id: string;
  label: string;
  position: number;
  revealed: boolean;
  coffeeId: string | null;
};

export function reconcileSamples<S extends SampleMeta & { coffee: unknown }>(
  local: readonly S[],
  server: readonly S[],
  referenceId: string | null | undefined,
): S[] {
  const byId = new Map(local.map((s) => [s.id, s] as const));
  const merged = server.map((srv) => {
    const mine = byId.get(srv.id);
    if (!mine) return srv;
    return {
      ...mine,
      label: srv.label,
      position: srv.position,
      revealed: srv.revealed,
      coffeeId: srv.coffeeId,
      coffee: srv.coffee,
    };
  });
  merged.sort((a, b) => a.position - b.position);
  return orderReferenceFirst(merged, referenceId);
}

/** Index to show after a reconcile: the sample the cupper was viewing if it
 *  still exists, otherwise clamped into range. */
export function indexAfterReconcile(
  next: readonly { id: string }[],
  currentId: string | null,
  previousIdx: number,
): number {
  if (next.length === 0) return 0;
  const i = currentId ? next.findIndex((s) => s.id === currentId) : -1;
  if (i >= 0) return i;
  return Math.min(Math.max(0, previousIdx), next.length - 1);
}
