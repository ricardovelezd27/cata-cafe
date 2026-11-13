/** The always-visible line under the cup grids: how flagged cups cost points
 *  (S10 WP1a review L3). A defective cup is also flagged non-uniform by the
 *  form, so with 2+ cups it costs 6 (4 + 2); with one cup uniformity does not
 *  exist, so it costs 4. The sentence about the group is shown ONLY in group
 *  sessions. Spanish only, like the rest of the cup grids' labels. */
export function cupScoreHint(isGroup: boolean): string {
  const rule =
    "Cada taza defectuosa te resta 6 puntos (4 por el defecto y 2 por no ser uniforme); con una sola taza, 4. Cada taza solo no uniforme, 2.";
  return isGroup ? `Tus tazas se suman a las del grupo. ${rule}` : rule;
}
