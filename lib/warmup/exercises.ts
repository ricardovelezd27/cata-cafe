// "Movimiento Sensorial" — Kim's five pre-cupping sensory warm-ups (Método
// Café Sensible, pilar 3: Sensibilidad). Long structured content lives here as
// typed TS (per the S6 i18n rule); only chrome strings go to messages/*.json.
//
// Source: Kim's "Movimiento_Sensorial_Ejercicios_App.md" (2026-10). On
// 2026-10-29 the step texts were rewritten in a conversational guide voice at
// Ricardo's request, because they are now also read aloud by text-to-speech
// while the cupper has their eyes closed. Kim's verbatim originals are in git
// history at commit 2c7ae35; both columns (ES and EN) await Kim's review. The
// ENGLISH column is still a DRAFT by the implementation team — see
// WARMUP_EN_STATUS.
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
  /** Fast "un par de veces" cycles for fast-open steps. Default (handled by the
   *  timeline): 1 for `up-down`, otherwise 2. */
  readonly reps?: number;
  /** Seconds of stillness ("primero la intención") before each leg of the step. */
  readonly leadInSec?: number;
  /** This step's text is shown under the PREVIOUS step's text at that second of
   *  the previous step, and this step gets no read beat of its own. */
  readonly readDuringPrevAtSec?: number;
}

/** Where an "observe" prompt is shown during the run: under a step's text
 *  (`atSec` counts from that step's first movement segment) or in the closing /
 *  done slot. */
export type ObserveSlot =
  | { readonly step: string; readonly atSec: number }
  | { readonly slot: "closing" | "done"; readonly atSec?: number };

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
   *  step durations is shorter). */
  readonly durationMin: number;
  readonly figureKind: WarmupFigureKind;
  readonly steps: readonly WarmupStep[];
  readonly observe: readonly Localized[];
  /** One entry per `observe` item (same length): where it is shown; null = not shown. */
  readonly observeAt: readonly (ObserveSlot | null)[];
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

/** Read beat before each step: seconds of stillness while the step text is read
 *  = clamp(baseSec + perWordSec * words, minSec, maxSec). */
export const READ_BEAT = { baseSec: 3, perWordSec: 0.25, minSec: 4, maxSec: 12 } as const;
/** Seconds of arrival (posture + breath) before the first step. */
export const WARMUP_ARRIVE_SEC = 40;
/** Seconds of the bridge to the cupping table after the closing. */
export const WARMUP_BRIDGE_SEC = 5;
/** Fast lead-in before a fast-open cycle starts, in ms. */
export const WARMUP_FAST_LEAD_IN_MS = 400;
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
          es: "Empezamos con el brazo. Primero, para conocer el camino, súbelo rápido, como lo harías normalmente. Y bájalo.",
          en: "We begin with the arm. First, to learn the path, raise it quickly, the way you normally would. And lower it.",
        },
        durationSec: 8,
        reps: 1, // v3 (council 2026-10-28): one raise-and-lower, not two
        figure: { kind: "arm-raise", variant: "fast-open", direction: "up-down" },
      },
      {
        id: "arm-raise-2",
        text: {
          es: "Ahora lo mismo, pero lento. Con los ojos abiertos, sube el brazo en 15 segundos, desde abajo hasta arriba.",
          en: "Now the same, but slowly. With your eyes open, raise your arm over 15 seconds, from bottom to top.",
        },
        durationSec: LEG,
        figure: { kind: "arm-raise", variant: "slow-open", direction: "up" },
      },
      {
        id: "arm-raise-3",
        text: {
          es: "Si en algún punto notas una pequeña resistencia, párate ahí unos segundos. Ese es tu punto de apoyo. El cuerpo se reajusta solo.",
          en: "If at some point you notice a slight resistance, stop there for a few seconds. That is your support point. The body readjusts on its own.",
        },
        durationSec: 10,
        readDuringPrevAtSec: 5, // v3 (council 2026-10-28): read while the arm rises, where the resistance appears
        figure: { kind: "arm-raise", variant: "slow-open", direction: "rest" },
      },
      {
        id: "arm-raise-4",
        text: {
          es: "Bien. Ahora baja el brazo, también en 15 segundos, con los ojos abiertos.",
          en: "Good. Now lower your arm, also over 15 seconds, with your eyes open.",
        },
        durationSec: LEG,
        figure: { kind: "arm-raise", variant: "slow-open", direction: "down" },
      },
      {
        id: "arm-raise-5",
        text: {
          es: "Cierra los ojos. Esta vez, sin mirar, sube el brazo otra vez hacia arriba, en 15 segundos.",
          en: "Close your eyes. This time, without looking, raise your arm up again, over 15 seconds.",
        },
        durationSec: LEG,
        figure: { kind: "arm-raise", variant: "slow-closed", direction: "up" },
      },
      {
        id: "arm-raise-6",
        text: {
          es: "Para ahí, arriba, tres segundos. Ahora baja despacio, de vuelta al costado, en 15 segundos.",
          en: "Hold there, at the top, for three seconds. Now lower it slowly, back to your side, over 15 seconds.",
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
    observeAt: [{ step: "arm-raise-4", atSec: 9 }, { step: "arm-raise-5", atSec: 9 }, { slot: "closing", atSec: 8 }], // v3 (council 2026-10-28)
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
          es: "Vamos a trabajar con la mirada. Cierra los ojos. Siente tus cuatro apoyos: pies en el suelo, nalgas en la silla, espalda en el respaldo, manos en las piernas.",
          en: "Let's work with the gaze. Close your eyes. Feel your four supports: feet on the floor, seat on the chair, back on the backrest, hands on your thighs.",
        },
        durationSec: 20,
        figure: { kind: "eyes", variant: "slow-closed", direction: "rest" },
      },
      {
        id: "eyes-2",
        text: {
          es: "Ahora, sin mover la cabeza, lleva solo los ojos hacia la derecha, muy lento. No vayas más lejos de lo que el cuerpo permite. Para tres segundos.",
          en: "Now, without moving your head, take only your eyes to the right, very slowly. Don't go further than the body allows. Hold for three seconds.",
        },
        durationSec: 15, // v3 (council 2026-10-28): was LEG + HOLD; the 3 s hold is inside the 15 s
        figure: { kind: "eyes", variant: "slow-closed", direction: "right" },
      },
      {
        id: "eyes-3",
        text: {
          es: "Bien. Vuelve al centro, despacio.",
          en: "Good. Come back to the centre, slowly.",
        },
        durationSec: 13, // v3 (council 2026-10-28): 10 s return + 3 s hold before it; pending Kim
        figure: { kind: "eyes", variant: "slow-closed", direction: "center", holdBeforeSec: HOLD },
      },
      {
        id: "eyes-4",
        text: {
          es: "Ahora hacia el otro lado. Lleva los ojos a la izquierda. Para tres segundos. Y vuelve al centro.",
          en: "Now to the other side. Take your eyes to the left. Hold for three seconds. And come back to the centre.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "eyes", variant: "slow-closed", direction: "left", returns: true },
      },
      {
        id: "eyes-5",
        text: {
          es: "Esta vez, lleva los ojos hacia arriba. Para. Y vuelve al centro.",
          en: "This time, take your eyes upward. Hold. And come back to the centre.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "eyes", variant: "slow-closed", direction: "up", returns: true },
      },
      {
        id: "eyes-6",
        text: {
          es: "Y ahora hacia abajo. Lleva los ojos abajo, despacio. Para. Vuelve al centro.",
          en: "And now downward. Take your eyes down, slowly. Hold. Come back to the centre.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "eyes", variant: "slow-closed", direction: "down", returns: true },
      },
      {
        id: "eyes-7",
        text: {
          es: "Bien. Deja los ojos descansar. Mira “hacia atrás”, hacia dentro de ti.",
          en: "Good. Let your eyes rest. Look “backwards”, inside yourself.",
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
    observeAt: [null, { step: "eyes-7", atSec: 12 }], // v3 (council 2026-10-28)
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
          es: "Empezamos con la cabeza. Con los ojos abiertos, gírala a la derecha y a la izquierda. Un par de veces, a velocidad normal. Los ojos siguen el horizonte.",
          en: "We begin with the head. With your eyes open, turn it right and left. A couple of times, at normal speed. Your eyes follow the horizon.",
        },
        durationSec: 12,
        figure: { kind: "head-rotate", variant: "fast-open", direction: "right-left" },
      },
      {
        id: "head-rotate-2",
        text: {
          es: "Ahora lo mismo, pero lento, con los ojos abiertos. 15 segundos hacia la derecha. Para tres segundos. Y 15 segundos hacia la izquierda.",
          en: "Now the same, but slowly, with your eyes open. 15 seconds to the right. Hold for three seconds. And 15 seconds to the left.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-open", direction: "right-left" },
      },
      {
        id: "head-rotate-3",
        text: {
          es: "Cierra los ojos. Mismo giro, ahora sin mirar: 15 segundos hacia la derecha, 15 hacia la izquierda.",
          en: "Close your eyes. Same turn, now without looking: 15 seconds to the right, 15 to the left.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "right-left" },
      },
      {
        id: "head-rotate-4",
        text: {
          es: "Bien. Vuelve al centro en 7 segundos.",
          en: "Good. Come back to the centre over 7 seconds.",
        },
        durationSec: 7,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "center" },
      },
      {
        id: "head-rotate-5",
        text: {
          es: "Ahora cambia el punto de arranque. Gira a la derecha, como si la nariz tirara hacia allí. La parte de atrás del cráneo va a la izquierda. 15 segundos, y vuelve igual.",
          en: "Now change the starting point. Turn right, as if your nose were pulling that way. The back of your skull goes to the left. 15 seconds, and return the same way.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "right-left", lead: "nose", returns: true }, // v3 (council 2026-10-28): return to centre
      },
      {
        id: "head-rotate-6",
        text: {
          es: "Otro punto de arranque. La oreja izquierda va hacia delante, y la derecha hacia atrás. Así la cabeza gira a la derecha. 15 segundos, y vuelve igual.",
          en: "Another starting point. The left ear moves forward, and the right ear back. So the head turns right. 15 seconds, and return the same way.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "right-left", lead: "ear", returns: true }, // v3 (council 2026-10-28): return to centre
      },
      {
        id: "head-rotate-7",
        text: {
          es: "Último giro, sin poner atención en ningún punto. Todo a la vez, de forma global. Hacia la derecha y hacia la izquierda.",
          en: "Last turn, without attention on any one point. Everything at once, globally. To the right and to the left.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "head-rotate", variant: "slow-closed", direction: "right-left", lead: "all" },
      },
      {
        id: "head-rotate-8",
        text: {
          es: "Y vuelve al centro, despacio.",
          en: "And come back to the centre, slowly.",
        },
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
    observeAt: [{ step: "head-rotate-3", atSec: 9 }, { step: "head-rotate-7", atSec: 9 }], // v3 (council 2026-10-28)
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
          es: "Empezamos con el tronco, hacia delante y atrás. Con los ojos abiertos, ve hacia delante y vuelve al centro. Un par de veces, rápido, para conocer el camino.",
          en: "We begin with the trunk, forward and back. With your eyes open, go forward and come back to the centre. A couple of times, fast, to learn the path.",
        },
        durationSec: 12,
        figure: { kind: "trunk-forward-back", variant: "fast-open", direction: "forward-back" },
      },
      {
        id: "trunk-forward-back-2",
        text: {
          es: "Ahora lo mismo, pero lento, con los ojos abiertos. 15 segundos hacia delante. Para tres segundos. Y 15 segundos de vuelta.",
          en: "Now the same, but slowly, with your eyes open. 15 seconds forward. Hold for three seconds. And 15 seconds back.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-open", direction: "forward-back" },
      },
      {
        id: "trunk-forward-back-3",
        text: {
          es: "Cierra los ojos. Mismo movimiento, sin mirar: 15 segundos hacia delante, 15 de vuelta al centro.",
          en: "Close your eyes. Same movement, without looking: 15 seconds forward, 15 back to the centre.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back" },
      },
      {
        id: "trunk-forward-back-4",
        text: {
          es: "Ahora cambia el punto de arranque. La cabeza inicia y guía el movimiento hacia delante. Para. Y vuelve.",
          en: "Now change the starting point. The head starts and guides the movement forward. Hold. And come back.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back", lead: "head" },
      },
      {
        id: "trunk-forward-back-5",
        text: {
          es: "Esta vez inician los hombros. Hacia delante, despacio. Para. Y vuelve.",
          en: "This time the shoulders start. Forward, slowly. Hold. And come back.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back", lead: "shoulders" },
      },
      {
        id: "trunk-forward-back-6",
        text: {
          es: "Ahora inicia la pelvis. Hacia delante. Para. Y vuelve.",
          en: "Now the pelvis starts. Forward. Hold. And come back.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back", lead: "pelvis" },
      },
      {
        id: "trunk-forward-back-7",
        text: {
          es: "Y ahora los tres a la vez. Cabeza, hombros y pelvis salen juntos hacia delante. Para. Vuelve.",
          en: "And now all three at once. Head, shoulders and pelvis set off forward together. Hold. Come back.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-forward-back", variant: "slow-closed", direction: "forward-back", lead: "all" },
      },
      {
        id: "trunk-forward-back-8",
        text: {
          es: "Último trayecto. Muévete solo un centímetro hacia delante, en 15 segundos. Primero la intención, después el movimiento. Vuelve igual.",
          en: "Last leg. Move only one centimetre forward, over 15 seconds. First the intention, then the movement. Return the same way.",
        },
        durationSec: ROUND_TRIP,
        leadInSec: 3, // v3 (council 2026-10-28): "primero la intención" — 3 s of stillness before each leg
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
    observeAt: [{ step: "trunk-forward-back-3", atSec: 9 }, { slot: "done" }, { step: "trunk-forward-back-8", atSec: 10 }], // v3 (council 2026-10-28)
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
          es: "Empezamos de lado a lado. Con los ojos abiertos, pasa el peso de un lado al otro. Un par de veces, rápido, para conocer el camino.",
          en: "We begin side to side. With your eyes open, shift your weight from one side to the other. A couple of times, fast, to learn the path.",
        },
        durationSec: 12,
        figure: { kind: "trunk-side", variant: "fast-open", direction: "right-left" },
      },
      {
        id: "trunk-side-2",
        text: {
          es: "Ahora lo mismo, pero lento, con los ojos abiertos. 15 segundos a la derecha. Para tres segundos. Y 15 segundos hasta la izquierda, pasando por el centro.",
          en: "Now the same, but slowly, with your eyes open. 15 seconds to the right. Hold for three seconds. And 15 seconds to the left, passing through the centre.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-open", direction: "right-left" },
      },
      {
        id: "trunk-side-3",
        text: {
          es: "Cierra los ojos. Mismo movimiento, con muy poco recorrido. 15 segundos a la derecha, 15 a la izquierda.",
          en: "Close your eyes. Same movement, with very little travel. 15 seconds to the right, 15 to the left.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", amplitude: "small" },
      },
      {
        id: "trunk-side-4",
        text: {
          es: "Ahora cambia el punto de arranque. La oreja derecha inicia y lleva todo el tronco a la derecha. Para. Vuelve iniciando con la oreja izquierda.",
          en: "Now change the starting point. The right ear starts and takes the whole trunk to the right. Hold. Return starting with the left ear.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", lead: "ear", returns: true }, // v3 (council 2026-10-28): return to centre
      },
      {
        id: "trunk-side-5",
        text: {
          es: "Esta vez inicia el hombro derecho, hacia la derecha. Para. Vuelve con el hombro izquierdo.",
          en: "This time the right shoulder starts, to the right. Hold. Return with the left shoulder.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", lead: "shoulders", returns: true }, // v3 (council 2026-10-28): return to centre
      },
      {
        id: "trunk-side-6",
        text: {
          es: "Ahora inicia la cadera derecha, hacia la derecha. Para. Vuelve con la cadera izquierda.",
          en: "Now the right hip starts, to the right. Hold. Return with the left hip.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", lead: "hip", returns: true }, // v3 (council 2026-10-28): return to centre
      },
      {
        id: "trunk-side-7",
        text: {
          es: "Último trayecto, global, sin atención en ningún punto. Todo a la vez: hacia la derecha y hacia la izquierda.",
          en: "Last leg, global, without attention on any one point. Everything at once: to the right and to the left.",
        },
        durationSec: ROUND_TRIP,
        figure: { kind: "trunk-side", variant: "slow-closed", direction: "right-left", lead: "all" },
      },
      {
        id: "trunk-side-8",
        text: {
          es: "Bien. Vuelve al centro cuando sientas el peso repartido entre los dos isquiones.",
          en: "Good. Come back to the centre when you feel the weight shared between both sit bones.",
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
    observeAt: [{ step: "trunk-side-4", atSec: 9 }, { step: "trunk-side-2", atSec: 22 }, { slot: "closing", atSec: 8 }], // v3 (council 2026-10-28)
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

/** Pick one locale out of a Localized string (unknown locales fall back to es). */
export function lw(text: Localized, locale: string): string {
  return locale === "en" ? text.en : text.es;
}
