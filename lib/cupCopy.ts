import type { SensoryDefect } from "@/lib/constants";

/**
 * Copy of the cup grid and the "your score comes after submitting" line
 * (messages `cupping.cups`). The cup page passes it as a prop; this fallback
 * exists ONLY for the cup error boundary, which rehydrates an older cached prop
 * blob that has no `cups` key. `tests/cupCopy.test.ts` keeps it equal to the
 * message files, so it cannot drift. `{n}`, `{u}`, `{d}` are replaced
 * client-side (fetched with `t.raw()` on the server).
 */
export type CupCopy = {
  title: string;
  nonUniform: string;
  defective: string;
  nonUniformLegend: string;
  defectiveLegend: string;
  oneTap: string;
  defectTap: string;
  defectType: string;
  scoreHint: string;
  scoreHintGroup: string;
  oneCupNote: string;
  pickTitle: string;
  pickHelp: string;
  typeMissing: string;
  removeMark: string;
  closePicker: string;
  cupDefectiveAria: string;
  cupNonUniformAria: string;
  changeTypeAria: string;
  nonUniformCountOne: string;
  nonUniformCountMany: string;
  defectiveCountOne: string;
  defectiveCountMany: string;
  types: Record<SensoryDefect, string>;
  scoreLater: string;
};

export const CUP_COPY_FALLBACK: Record<"es" | "en", CupCopy> = {
  es: {
    title: "Tazas",
    nonUniform: "No uniformes",
    defective: "Defectuosas",
    nonUniformLegend: "No uniforme",
    defectiveLegend: "Defectuosa",
    oneTap: "(1 toque)",
    defectTap: "(toca y elige el tipo)",
    defectType: "Tipo de defecto",
    scoreHint:
      "Cada taza defectuosa te resta 6 puntos (4 por el defecto y 2 por no ser uniforme); con una sola taza, 4. Cada taza solo no uniforme, 2.",
    scoreHintGroup: "Tus tazas se suman a las del grupo.",
    oneCupNote: "Con una taza no se evalúa uniformidad.",
    pickTitle: "Taza {n}: ¿qué defecto tiene?",
    pickHelp: "Sin elegir un tipo, la taza no queda marcada.",
    typeMissing: "Falta el tipo de defecto",
    removeMark: "Quitar marca",
    closePicker: "Cerrar",
    cupDefectiveAria: "Taza {n} defectuosa",
    cupNonUniformAria: "Taza {n} no uniforme",
    changeTypeAria: "Cambiar el tipo de defecto de la taza {n}",
    nonUniformCountOne: "{n} no uniforme",
    nonUniformCountMany: "{n} no uniformes",
    defectiveCountOne: "{n} defectuosa",
    defectiveCountMany: "{n} defectuosas",
    types: { moldy: "Mohoso", phenolic: "Fenólico", potato: "Papa" },
    scoreLater: "Verás tu puntaje al enviar la evaluación.",
  },
  en: {
    title: "Cups",
    nonUniform: "Non-uniform",
    defective: "Defective",
    nonUniformLegend: "Non-uniform",
    defectiveLegend: "Defective",
    oneTap: "(1 tap)",
    defectTap: "(tap, then pick the type)",
    defectType: "Defect type",
    scoreHint:
      "Each defective cup subtracts 6 points (4 for the defect and 2 for not being uniform); with a single cup, 4. A cup that is only non-uniform subtracts 2.",
    scoreHintGroup: "Your cups are added to the group's cups.",
    oneCupNote: "With one cup, uniformity is not assessed.",
    pickTitle: "Cup {n}: which defect does it have?",
    pickHelp: "Without a type, the cup is not marked.",
    typeMissing: "Defect type missing",
    removeMark: "Remove mark",
    closePicker: "Close",
    cupDefectiveAria: "Cup {n} defective",
    cupNonUniformAria: "Cup {n} non-uniform",
    changeTypeAria: "Change the defect type of cup {n}",
    nonUniformCountOne: "{n} non-uniform",
    nonUniformCountMany: "{n} non-uniform",
    defectiveCountOne: "{n} defective",
    defectiveCountMany: "{n} defective",
    types: { moldy: "Moldy", phenolic: "Phenolic", potato: "Potato" },
    scoreLater: "You will see your score when you submit.",
  },
};

/** The grid summary line, with singular forms ("1 no uniforme · 1 defectuosa"). */
export function cupSummary(copy: CupCopy, nonUniform: number, defective: number): string {
  const part = (tpl: string, n: number) => tpl.replace("{n}", String(n));
  return [
    part(nonUniform === 1 ? copy.nonUniformCountOne : copy.nonUniformCountMany, nonUniform),
    part(defective === 1 ? copy.defectiveCountOne : copy.defectiveCountMany, defective),
  ].join(" · ");
}
