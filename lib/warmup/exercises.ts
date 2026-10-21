// "Movimiento Sensorial" — Kim's five pre-cupping sensory warm-ups (Método
// Café Sensible, pilar 3: Sensibilidad). Long structured content lives here as
// typed TS (per the S6 i18n rule); only chrome strings go to messages/*.json.
//
// Source of truth for the Spanish text: Kim's "Movimiento_Sensorial_Ejercicios_
// App.md" (2026-10). The ENGLISH column is a DRAFT translation written by the
// implementation team and flagged for Kim's review — see WARMUP_EN_STATUS.
//
// Pure module (no React, no Prisma) so tests/warmup.test.ts can import it and
// so the figures/player can consume it on both server and client.

export type WarmupLocale = "es" | "en";
export type Localized = Readonly<Record<WarmupLocale, string>>;

/** Which figure animates the step (one SVG figure component per kind). */
export type WarmupFigureKind =
  | "arm-raise"
  | "eyes"
  | "head-rotate"
  | "trunk-forward-back"
  | "trunk-side";

/** Kim's evolution: first fast with eyes open (to learn the path), then slow
 *  with eyes open, then slow with eyes closed. */
export type WarmupFigureVariant = "fast-open" | "slow-open" | "slow-closed";

/** Trajectory the moving group follows during the step. Round trips
 *  ("up-down", "right-left", "forward-back") include the 3 s hold at the end
 *  of the first leg; "center" is a return to neutral; "rest" is stillness. */
export type WarmupDirection =
  | "up"
  | "down"
  | "up-down"
  | "left"
  | "right"
  | "right-left"
  | "forward"
  | "back"
  | "forward-back"
  | "center"
  | "rest";

/** Body part that INITIATES the movement ("punto de arranque") — the figure
 *  highlights it. "all" = global movement, no particular lead. */
export type WarmupLead =
  | "head"
  | "nose"
  | "ear"
  | "shoulders"
  | "pelvis"
  | "hip"
  | "all";

export interface WarmupFigure {
  readonly kind: WarmupFigureKind;
  readonly variant: WarmupFigureVariant;
  readonly direction?: WarmupDirection;
  readonly lead?: WarmupLead;
  /** Tiny range of motion (ex. 4 step 8: one centimetre). */
  readonly amplitude?: "normal" | "small";
  /** Seconds held in the previous end-pose BEFORE this step's leg starts
   *  ("Para arriba tres segundos. Baja en 15 segundos."). */
  readonly holdBeforeSec?: number;
  /** The step goes out, holds and comes back to neutral within its own
   *  duration ("Lleva los ojos a la izquierda. Para. Vuelve al centro."). */
  readonly returns?: boolean;
}

export interface WarmupStep {
  readonly id: string;
  readonly text: Localized;
  /** Seconds the player counts down for this step (Kim's 15 s legs + holds). */
  readonly durationSec: number;
  readonly figure: WarmupFigure;
}

export type WarmupPosture = "seated" | "standing";

export interface WarmupExercise {
  readonly id: WarmupId;
  readonly slug: string;
  readonly order: number;
  readonly name: Localized;
  readonly purpose: Localized;
  readonly posture: WarmupPosture;
  readonly postureText: Localized;
  /** Kim's approximate total minutes (includes breathing room; the sum of
   *  step durations is shorter — see tests/warmup.test.ts). */
  readonly durationMin: number;
  readonly figureKind: WarmupFigureKind;
  readonly steps: readonly WarmupStep[];
  readonly observe: readonly Localized[];
  /** The same two closing questions in all five (WARMUP_SHARED.closing). */
  readonly closing: readonly [Localized, Localized];
}

export const WARMUP_IDS = [
  "arm-raise",
  "eyes",
  "head-rotate",
  "trunk-forward-back",
  "trunk-side",
] as const;
export type WarmupId = (typeof WARMUP_IDS)[number];

/** Seconds of stillness between steps in the player. */
export const WARMUP_STEP_PAUSE_SEC = 3;
/** Seconds held in the neutral position before the closing questions. */
export const WARMUP_CLOSING_HOLD_SEC = 30;
/** Kim's unit of slowness: one leg of a movement. */
export const WARMUP_LEG_SEC = 15;
/** "Para tres segundos" — the hold at the end of a leg. */
export const WARMUP_HOLD_SEC = 3;

/** EN column status — surfaced in the dev review page and the PR, never to
 *  end users. Flip to "reviewed" once Kim signs the English off. */
export const WARMUP_EN_STATUS: "draft-pending-kim" | "reviewed" = "draft-pending-kim";

const CLOSING: readonly [Localized, Localized] = [
  {
    es: "¿Cómo me hace sentir este ejercicio?",
    en: "How does this exercise make me feel?",
  },
  {
    es: "¿Qué es nuevo para mí?",
    en: "What is new for me?",
  },
];

export const WARMUP_SHARED = {
  title: { es: "Movimiento Sensorial", en: "Sensory Movement" },
  subtitle: {
    es: "Método Café Sensible · Pilar 3: Sensibilidad",
    en: "Café Sensible Method · Pillar 3: Sensitivity",
  },
  intro: {
    es: "Cinco ejercicios para despertar la percepción antes de catar. El orden recomendado es del 1 al 5: el primero es la puerta de entrada. Cada uno se puede hacer solo.",
    en: "Five exercises to wake up perception before cupping. The recommended order is 1 to 5: the first one is the way in. Each can be done on its own.",
  },
  safety: {
    title: { es: "Regla de seguridad", en: "Safety rule" },
    text: {
      es: "Si aparece dolor, molestia o resistencia, para ahí. No fuerces. Espera unos segundos y vuelve por el mismo camino. No compites con nadie.",
      en: "If pain, discomfort or resistance appears, stop there. Don't force it. Wait a few seconds and come back along the same path. You are not competing with anyone.",
    },
  },
  fifteenSeconds: {
    title: { es: "Los 15 segundos", en: "The 15 seconds" },
    text: {
      es: "Cada trayecto dura unos 15 segundos. Esa lentitud es la herramienta: cuando te mueves rápido no percibes el camino; cuando te mueves lento, aparece la información.",
      en: "Each leg of a movement takes about 15 seconds. That slowness is the tool: when you move fast you don't perceive the path; when you move slowly, the information appears.",
    },
  },
  evolution: {
    title: { es: "La evolución", en: "The progression" },
    text: {
      es: "Todos los movimientos siguen el mismo orden: primero rápido con los ojos abiertos (para conocer el camino), después lento con los ojos abiertos, después lento con los ojos cerrados.",
      en: "Every movement follows the same order: first fast with eyes open (to learn the path), then slow with eyes open, then slow with eyes closed.",
    },
    stages: {
      "fast-open": { es: "Rápido · ojos abiertos", en: "Fast · eyes open" },
      "slow-open": { es: "Lento · ojos abiertos", en: "Slow · eyes open" },
      "slow-closed": { es: "Lento · ojos cerrados", en: "Slow · eyes closed" },
    } satisfies Record<WarmupFigureVariant, Localized>,
  },
  closing: {
    title: { es: "Cierre", en: "Closing" },
    text: {
      es: "Al terminar, quédate 30 segundos en la posición neutral y responde:",
      en: "When you finish, stay 30 seconds in the neutral position and answer:",
    },
    questions: CLOSING,
  },
  posture: {
    seated: { es: "Sentado", en: "Seated" },
    standing: { es: "De pie o sentado", en: "Standing or seated" },
  } satisfies Record<WarmupPosture, Localized>,
} as const;

const LEG = WARMUP_LEG_SEC;
const HOLD = WARMUP_HOLD_SEC;
const ROUND_TRIP = LEG + HOLD + LEG; // 15 s out, 3 s hold, 15 s back

export const WARMUP_EXERCISES: readonly WarmupExercise[] = [
  // ───────────────────────────── 1 · El brazo lento ─────────────────────────────
  {
    id: "arm-raise",
    slug: "brazo-lento",
    order: 1,
    name: { es: "El brazo lento", en: "The slow arm" },
    purpose: {
      es: "Entender en dos minutos qué es un movimiento sensorial y por qué la lentitud abre la percepción.",
      en: "Understand in two minutes what a sensory movement is and why slowness opens up perception.",
    },
    posture: "standing",
    postureText: {
      es: "De pie o sentado, con un brazo colgando relajado al lado del cuerpo.",
      en: "Standing or seated, with one arm hanging relaxed by your side.",
    },
    durationMin: 3,
    figureKind: "arm-raise",
    steps: [
      {
        id: "arm-raise-1",
        text: {
          es: "Sube el brazo hacia arriba rápido, como lo harías normalmente. Bájalo.",
          en: "Raise your arm quickly, the way you normally would. Lower it.",
        },
        durationSec: 8,
        figure: { kind: "arm-raise", variant: "fast-open", direction: "up-down" },
      },
      {
        id: "arm-raise-2",
        text: {
          es: "Ahora súbelo lento, con los ojos abiertos: tarda 15 segundos desde abajo hasta arriba.",
          en: "Now raise it slowly, eyes open: take 15 seconds from bottom to top.",
        },
        durationSec: LEG,
        figure: { kind: "arm-raise", variant: "slow-open", direction: "up" },
      },
      {
        id: "arm-raise-3",
        text: {
          es: "Si en algún punto notas una pequeña resistencia, párate ahí unos segundos. Ese es tu punto de apoyo: el cuerpo se reajusta solo.",
          en: "If at some point you notice a slight resistance, stop there for a few seconds. That is your support point: the body readjusts on its own.",
        },
        durationSec: 10,
        figure: { kind: "arm-raise", variant: "slow-open", direction: "rest" },
      },
      {
        id: "arm-raise-4",
        text: {
          es: "Baja el brazo en 15 segundos, con los ojos abiertos.",
          en: "Lower your arm over 15 seconds, eyes open.",
        },
        durationSec: LEG,
        figure: { kind: "arm-raise", variant: "slow-open", direction: "down" },
      },
      {
        id: "arm-raise-5",
        text: {
          es: "Cierra los ojos. Sube el brazo en 15 segundos.",
          en: "Close your eyes. Raise your arm over 15 seconds.",
        },
        durationSec: LEG,
        figure: { kind: "arm-raise", variant: "slow-closed", direction: "up" },
      },
      {
        id: "arm-raise-6",
        text: {
          es: "Para arriba tres segundos. Baja en 15 segundos.",
          en: "Hold at the top for three seconds. Lower over 15 seconds.",
        },
        durationSec: HOLD + LEG,
        figure: { kind: "arm-raise", variant: "slow-closed", direction: "down", holdBeforeSec: HOLD },
      },
    ],
    observe: [
      {
        es: "Dónde aparece resistencia al ir lento que no notabas al ir rápido.",
        en: "Where resistance appears when going slowly that you didn't notice going fast.",
      },
      {
        es: "Dónde está tu mano en el espacio con los ojos cerrados.",
        en: "Where your hand is in space with your eyes closed.",
      },
      {
        es: "Qué cambia entre la primera subida y la última.",
        en: "What changes between the first raise and the last.",
      },
    ],
    closing: CLOSING,
  },

  // ─────────────────────────────── 2 · Los ojos ───────────────────────────────
  {
    id: "eyes",
    slug: "ojos",
    order: 2,
    name: { es: "Los ojos", en: "The eyes" },
    purpose: {
      es: "Relajar el sentido que más ocupa el cerebro (la vista) para dar sitio a los demás. Ideal justo antes de oler o probar un café.",
      en: "Relax the sense that keeps the brain busiest (sight) to make room for the others. Ideal right before smelling or tasting a coffee.",
    },
    posture: "seated",
    postureText: {
      es: "Sentado en una silla firme, espalda apoyada en el respaldo, pies planos en el suelo, manos sobre las piernas. Ojos cerrados durante todo el ejercicio. La cabeza no se mueve en ningún momento.",
      en: "Seated on a firm chair, back against the backrest, feet flat on the floor, hands on your thighs. Eyes closed for the whole exercise. The head never moves.",
    },
    durationMin: 5,
    figureKind: "eyes",
    steps: [
      {
        id: "eyes-1",
        text: {
          es: "Con los ojos cerrados, siente tus cuatro apoyos: pies en el suelo, nalgas en la silla, espalda en el respaldo, manos en las piernas.",
          en: "With your eyes closed, feel your four supports: feet on the floor, seat on the chair, back on the backrest, hands on your thighs.",
        },
        durationSec: 20,
        figure: { kind: "eyes", variant: "slow-closed", direction: "rest" },
      },
      {
        id: "eyes-2",
        text: {
          es: "Mueve solo los ojos, muy lento, hacia la derecha. No vayas más lejos de lo que el cuerpo permite. Para tres segundos.",
          en: "Move only your eyes, very slowly, to the right. Don't go further than the body allows. Hold for three seconds.",
        },
        durationSec: LEG + HOLD,
        figure: { kind: "eyes", variant: "slow-closed", direction: "right" },
      },
      {
        id: "eyes-3",
        text: { es: "Vuelve al centro.", en: "Return to the centre." },
        durationSec: 10,
        figure: { kind: "eyes", variant: "slow-closed", direction: "center" },
      },
      {
        id: "eyes-4",
        text: {
          es: "Lleva los ojos a la izquierda. Para tres segundos. Vuelve al centro.",
          en: "Take your eyes to the left. Hold for three seconds. Return to the centre.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "eyes", variant: "slow-closed", direction: "left", returns: true },
      },
      {
        id: "eyes-5",
        text: {
          es: "Lleva los ojos hacia arriba. Para. Vuelve al centro.",
          en: "Take your eyes upward. Hold. Return to the centre.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "eyes", variant: "slow-closed", direction: "up", returns: true },
      },
      {
        id: "eyes-6",
        text: {
          es: "Lleva los ojos hacia abajo. Para. Vuelve al centro.",
          en: "Take your eyes downward. Hold. Return to the centre.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "eyes", variant: "slow-closed", direction: "down", returns: true },
      },
      {
        id: "eyes-7",
        text: {
          es: "Deja los ojos descansar. Mira “hacia atrás”, hacia dentro de ti.",
          en: "Let your eyes rest. Look “backwards”, inside yourself.",
        },
        durationSec: 30,
        figure: { kind: "eyes", variant: "slow-closed", direction: "rest" },
      },
    ],
    observe: [
      {
        es: "Si los ojos van más suaves en la segunda vuelta que en la primera.",
        en: "Whether your eyes move more smoothly on the second round than on the first.",
      },
      {
        es: "Qué cambia cuando dejas de mirar hacia fuera.",
        en: "What changes when you stop looking outward.",
      },
    ],
    closing: CLOSING,
  },

  // ─────────────────────────────── 3 · La cabeza ──────────────────────────────
  {
    id: "head-rotate",
    slug: "cabeza",
    order: 3,
    name: { es: "La cabeza", en: "The head" },
    purpose: {
      es: "Soltar la zona donde están cuatro de los cinco sentidos (nariz, boca, oídos, ojos). Es el ejercicio más fácil de introducir en un ritual de cata.",
      en: "Release the area that holds four of the five senses (nose, mouth, ears, eyes). It is the easiest exercise to bring into a cupping ritual.",
    },
    posture: "seated",
    postureText: {
      es: "Sentado en una silla firme, espalda apoyada, pies planos, manos sobre las piernas. El movimiento es un giro de la cabeza hacia un lado y hacia el otro, sin inclinarla.",
      en: "Seated on a firm chair, back supported, feet flat, hands on your thighs. The movement is a turn of the head to one side and the other, without tilting it.",
    },
    durationMin: 7,
    figureKind: "head-rotate",
    steps: [
      {
        id: "head-rotate-1",
        text: {
          es: "Con los ojos abiertos, gira la cabeza a la derecha y a la izquierda un par de veces a velocidad normal. Los ojos siguen el horizonte.",
          en: "With eyes open, turn your head right and left a couple of times at normal speed. Your eyes follow the horizon.",
        },
        durationSec: 12,
        figure: { kind: "head-rotate", variant: "fast-open", direction: "right-left" },
      },
      {
        id: "head-rotate-2",
        text: {
          es: "Repite más lento, con los ojos abiertos: 15 segundos hacia la derecha, para tres segundos, 15 segundos hacia la izquierda.",
          en: "Repeat more slowly, eyes open: 15 seconds to the right, hold three seconds, 15 seconds to the left.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-open", direction: "right-left" },
      },
      {
        id: "head-rotate-3",
        text: {
          es: "Cierra los ojos. Mismo giro, 15 segundos por lado.",
          en: "Close your eyes. Same turn, 15 seconds per side.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "right-left" },
      },
      {
        id: "head-rotate-4",
        text: { es: "Vuelve al centro en 7 segundos.", en: "Return to the centre over 7 seconds." },
        durationSec: 7,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "center" },
      },
      {
        id: "head-rotate-5",
        text: {
          es: "Ahora cambia el punto de arranque. Gira a la derecha imaginando que la nariz tira hacia la derecha y la parte de atrás del cráneo va hacia la izquierda. 15 segundos. Vuelve igual hacia el otro lado.",
          en: "Now change the starting point. Turn right imagining that your nose pulls to the right and the back of your skull goes to the left. 15 seconds. Return the same way to the other side.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "right-left", lead: "nose" },
      },
      {
        id: "head-rotate-6",
        text: {
          es: "Otro punto de arranque: la oreja izquierda va hacia delante y la derecha hacia atrás. La cabeza gira a la derecha. 15 segundos. Vuelve igual hacia el otro lado.",
          en: "Another starting point: the left ear moves forward and the right ear back. The head turns right. 15 seconds. Return the same way to the other side.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "right-left", lead: "ear" },
      },
      {
        id: "head-rotate-7",
        text: {
          es: "Último giro sin poner atención en ningún punto: todo a la vez, de forma global. Un lado y el otro.",
          en: "Last turn without attention on any one point: everything at once, globally. One side and the other.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "right-left", lead: "all" },
      },
      {
        id: "head-rotate-8",
        text: { es: "Vuelve al centro.", en: "Return to the centre." },
        durationSec: 7,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "center" },
      },
    ],
    observe: [
      {
        es: "Hacia dónde van los ojos cuando gira la cabeza: ¿la acompañan o parece que van al lado contrario?",
        en: "Where your eyes go when the head turns: do they follow it, or do they seem to go the opposite way?",
      },
      {
        es: "Si en la última vuelta llegas un poco más lejos que en la primera, sin forzar.",
        en: "Whether on the last turn you reach a little further than on the first, without forcing.",
      },
    ],
    closing: CLOSING,
  },

  // ──────────────────────── 4 · Adelante y atrás en la silla ───────────────────
  {
    id: "trunk-forward-back",
    slug: "adelante-atras",
    order: 4,
    name: { es: "Adelante y atrás en la silla", en: "Forward and back on the chair" },
    purpose: {
      es: "Desarrollar la propiocepción y la estabilidad. Sentir el centro del cuerpo.",
      en: "Develop proprioception and stability. Feel the centre of the body.",
    },
    posture: "seated",
    postureText: {
      es: "Sentado hacia la mitad de una silla firme (sin ruedas), espalda separada del respaldo, pies planos, manos sobre las piernas, hombros encima de la cadera. El movimiento es llevar todo el tronco hacia delante y volver al centro, sin doblar la espalda: cabeza, pecho y abdomen van juntos.",
      en: "Seated towards the middle of a firm chair (no wheels), back away from the backrest, feet flat, hands on your thighs, shoulders above your hips. The movement is taking the whole trunk forward and back to the centre, without bending the back: head, chest and abdomen move together.",
    },
    durationMin: 8,
    figureKind: "trunk-forward-back",
    steps: [
      {
        id: "trunk-forward-back-1",
        text: {
          es: "Con los ojos abiertos, ve hacia delante y vuelve al centro un par de veces, rápido, para conocer el camino.",
          en: "With eyes open, go forward and back to the centre a couple of times, fast, to learn the path.",
        },
        durationSec: 12,
        figure: { kind: "trunk-forward-back", variant: "fast-open", direction: "forward-back" },
      },
      {
        id: "trunk-forward-back-2",
        text: {
          es: "Repite lento, con los ojos abiertos: 15 segundos hacia delante, para tres segundos, 15 segundos de vuelta.",
          en: "Repeat slowly, eyes open: 15 seconds forward, hold three seconds, 15 seconds back.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-open", direction: "forward-back" },
      },
      {
        id: "trunk-forward-back-3",
        text: {
          es: "Cierra los ojos. Mismo movimiento, 15 segundos por trayecto.",
          en: "Close your eyes. Same movement, 15 seconds per leg.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back" },
      },
      {
        id: "trunk-forward-back-4",
        text: {
          es: "Cambia el punto de arranque: la cabeza inicia y guía el movimiento hacia delante. Para. Vuelve.",
          en: "Change the starting point: the head starts and guides the movement forward. Hold. Return.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back", lead: "head" },
      },
      {
        id: "trunk-forward-back-5",
        text: { es: "Ahora inician los hombros. Para. Vuelve.", en: "Now the shoulders start. Hold. Return." },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back", lead: "shoulders" },
      },
      {
        id: "trunk-forward-back-6",
        text: { es: "Ahora inicia la pelvis. Para. Vuelve.", en: "Now the pelvis starts. Hold. Return." },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back", lead: "pelvis" },
      },
      {
        id: "trunk-forward-back-7",
        text: {
          es: "Ahora los tres a la vez: cabeza, hombros y pelvis salen juntos. Para. Vuelve.",
          en: "Now all three at once: head, shoulders and pelvis set off together. Hold. Return.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back", lead: "all" },
      },
      {
        id: "trunk-forward-back-8",
        text: {
          es: "Último trayecto: muévete solo un centímetro hacia delante en 15 segundos. Primero la intención, después el movimiento. Vuelve igual.",
          en: "Last leg: move only one centimetre forward over 15 seconds. First the intention, then the movement. Return the same way.",
        },
        durationSec: ROUND_TRIP,
        figure: {
          kind: "trunk-forward-back",
          variant: "slow-closed",
          direction: "forward-back",
          amplitude: "small",
        },
      },
    ],
    observe: [
      {
        es: "Mientras la cabeza va hacia delante, los isquiones (los huesos sobre los que te sientas) van hacia atrás. Son dos direcciones a la vez.",
        en: "While the head goes forward, the sit bones (the bones you sit on) go back. Two directions at once.",
      },
      {
        es: "Cuál de los tres puntos de arranque te resulta más fácil de sentir.",
        en: "Which of the three starting points is easiest for you to feel.",
      },
      {
        es: "En el paso 8: aunque te muevas un centímetro, la sensación de recorrido es mucho mayor.",
        en: "In step 8: even if you move one centimetre, the sense of travel is much greater.",
      },
    ],
    closing: CLOSING,
  },

  // ───────────────────────── 5 · De lado a lado en la silla ────────────────────
  {
    id: "trunk-side",
    slug: "lado-a-lado",
    order: 5,
    name: { es: "De lado a lado en la silla", en: "Side to side on the chair" },
    purpose: {
      es: "Ampliar la conciencia del cuerpo en el plano lateral y ganar seguridad. Es el mismo principio de la cata: primero cada atributo por separado, después la impresión global.",
      en: "Widen body awareness in the lateral plane and gain confidence. It is the same principle as cupping: first each attribute separately, then the overall impression.",
    },
    posture: "seated",
    postureText: {
      es: "Sentado hacia la mitad de una silla firme, espalda separada del respaldo, pies planos, manos sobre las piernas. El movimiento es desplazar todo el tronco hacia la derecha y hacia la izquierda sin inclinarse. Los hombros se quedan siempre encima de la cadera. Un isquion recibe el peso y el otro se alivia.",
      en: "Seated towards the middle of a firm chair, back away from the backrest, feet flat, hands on your thighs. The movement is shifting the whole trunk to the right and to the left without leaning. The shoulders always stay above the hips. One sit bone takes the weight and the other is relieved.",
    },
    durationMin: 8,
    figureKind: "trunk-side",
    steps: [
      {
        id: "trunk-side-1",
        text: {
          es: "Con los ojos abiertos, pasa el peso de un lado al otro un par de veces, rápido, para conocer el camino.",
          en: "With eyes open, shift your weight from one side to the other a couple of times, fast, to learn the path.",
        },
        durationSec: 12,
        figure: { kind: "trunk-side", variant: "fast-open", direction: "right-left" },
      },
      {
        id: "trunk-side-2",
        text: {
          es: "Repite lento, con los ojos abiertos: 15 segundos a la derecha, para tres segundos, 15 segundos hasta la izquierda pasando por el centro.",
          en: "Repeat slowly, eyes open: 15 seconds to the right, hold three seconds, 15 seconds to the left passing through the centre.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-open", direction: "right-left" },
      },
      {
        id: "trunk-side-3",
        text: {
          es: "Cierra los ojos. Mismo movimiento, muy poco recorrido, 15 segundos por trayecto.",
          en: "Close your eyes. Same movement, very little travel, 15 seconds per leg.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", amplitude: "small" },
      },
      {
        id: "trunk-side-4",
        text: {
          es: "Cambia el punto de arranque: la oreja derecha inicia y lleva todo el tronco a la derecha. Para. Vuelve iniciando con la oreja izquierda.",
          en: "Change the starting point: the right ear starts and takes the whole trunk to the right. Hold. Return starting with the left ear.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", lead: "ear" },
      },
      {
        id: "trunk-side-5",
        text: {
          es: "Ahora inicia el hombro derecho. Para. Vuelve con el hombro izquierdo.",
          en: "Now the right shoulder starts. Hold. Return with the left shoulder.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", lead: "shoulders" },
      },
      {
        id: "trunk-side-6",
        text: {
          es: "Ahora inicia la cadera derecha. Para. Vuelve con la cadera izquierda.",
          en: "Now the right hip starts. Hold. Return with the left hip.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", lead: "hip" },
      },
      {
        id: "trunk-side-7",
        text: {
          es: "Último trayecto global, sin atención en ningún punto: todo a la vez, un lado y el otro.",
          en: "Last global leg, without attention on any one point: everything at once, one side and the other.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", lead: "all" },
      },
      {
        id: "trunk-side-8",
        text: {
          es: "Vuelve al centro cuando sientas el peso repartido entre los dos isquiones.",
          en: "Return to the centre when you feel the weight shared between both sit bones.",
        },
        durationSec: 10,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "center" },
      },
    ],
    observe: [
      {
        es: "Al ir hacia la derecha, mantén presencia en el lado izquierdo del que vienes. No sueltes el punto de partida.",
        en: "As you go right, keep your presence on the left side you are coming from. Don't let go of the starting point.",
      },
      {
        es: "El momento exacto en que cruzas el centro.",
        en: "The exact moment you cross the centre.",
      },
      {
        es: "Si sientes calor en las manos: es normal, la circulación se abre.",
        en: "If you feel warmth in your hands: that is normal, circulation is opening up.",
      },
    ],
    closing: CLOSING,
  },
];

const BY_ID: ReadonlyMap<string, WarmupExercise> = new Map(
  WARMUP_EXERCISES.map((e) => [e.id, e]),
);
const BY_SLUG: ReadonlyMap<string, WarmupExercise> = new Map(
  WARMUP_EXERCISES.map((e) => [e.slug, e]),
);

export function warmupById(id: string | null | undefined): WarmupExercise | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

export function warmupBySlug(slug: string | null | undefined): WarmupExercise | null {
  return slug ? (BY_SLUG.get(slug) ?? null) : null;
}

export function isWarmupId(value: unknown): value is WarmupId {
  return typeof value === "string" && (WARMUP_IDS as readonly string[]).includes(value);
}

/** Seconds the player will actually run for an exercise: every step, the
 *  3 s pause between steps, and the 30 s neutral hold before the closing
 *  questions. Kim's `durationMin` is a looser, human estimate. */
export function warmupPlayerSeconds(ex: WarmupExercise): number {
  const steps = ex.steps.reduce((acc, s) => acc + s.durationSec, 0);
  const pauses = Math.max(0, ex.steps.length - 1) * WARMUP_STEP_PAUSE_SEC;
  return steps + pauses + WARMUP_CLOSING_HOLD_SEC;
}

/** Pick one locale out of a Localized string (unknown locales fall back to es). */
export function lw(text: Localized, locale: string): string {
  return locale === "en" ? text.en : text.es;
}
