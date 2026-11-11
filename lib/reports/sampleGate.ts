// Viewer gate for the per-sample payload of the results page (S8-02,
// F-resultados-2). The UI already hid these two things; this stops the server
// from serializing them in the first place:
//  - `physical` (green-bean sheet) is per-sample and owner-authored: owner /
//    super-admin lens only.
//  - the community aggregate of a GROUP session while results are hidden
//    (canViewGroupResults false). Solo sessions keep the trigger-row fallback.
// Pure module: no scoring maths, nothing imported.

export interface SampleGateContext {
  ownerRead: boolean;
  isGroup: boolean;
  canViewGroup: boolean;
}

/** True when a group session's community numbers must not leave the server. */
export function communityHidden(ctx: SampleGateContext): boolean {
  return ctx.isGroup && !ctx.canViewGroup;
}

export function gateSampleForViewer<A>(
  input: { physical: Record<string, unknown>; aggregateScore: A | null },
  ctx: SampleGateContext,
): { physical: Record<string, unknown>; aggregateScore: A | null } {
  return {
    physical: ctx.ownerRead ? input.physical : {},
    aggregateScore: communityHidden(ctx) ? null : input.aggregateScore,
  };
}
