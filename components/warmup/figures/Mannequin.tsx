import type { CSSProperties, ReactNode } from "react";
import type { WarmupLead } from "@/lib/warmup/exercises";
import s from "./figures.module.css";

/**
 * Shared line-art mannequin for the warm-up figures. One SVG, two views:
 *
 *  - "front": the figure faces the viewer. MIRROR semantics — "derecha" in
 *    Kim's instructions moves toward the VIEWER's right, like a mirror in a
 *    movement studio. (Anatomically the figure's right is the viewer's left,
 *    but a front-facing diagram that moves "the other way" reads as wrong.)
 *  - "side": profile, facing right = forward (for the trunk forward/back).
 *
 * Every movable group carries a `data-part` so the figures can target it
 * with a CSS-module animation class (via `partClass`) or an inline static
 * transform (reduced motion). Strokes use `currentColor`; fills use design
 * tokens — no hex literals.
 *
 * viewBox is 0 0 240 320 user units. Pivots used by figures.module.css:
 *   front arm-r shoulder (146,112) · front upper hips (120,206)
 *   side  upper hips (118,206)
 */

export type MannequinPart =
  | "head"
  | "face"
  | "pupils"
  | "torso"
  | "arm-l"
  | "arm-r"
  | "upper"
  | "chair"
  | "legs";

export type MannequinView = "front" | "side";

export const MANNEQUIN_VIEWBOX = "0 0 240 320";
/** Close-up on the head for the eyes exercise. */
export const MANNEQUIN_FACE_VIEWBOX = "78 26 84 66";

export interface MannequinProps {
  view: MannequinView;
  posture: "seated" | "standing";
  eyes: "open" | "closed";
  /** Crop to the face (eyes exercise). */
  zoom?: "face";
  /** Body part that initiates the movement — gets a pulsing marker. */
  lead?: WarmupLead;
  /** Per-part className (CSS-module animation classes). */
  partClass?: Partial<Record<MannequinPart, string>>;
  /** Per-part inline style (static end-pose under reduced motion). */
  partStyle?: Partial<Record<MannequinPart, CSSProperties>>;
  /** Root className + style (CSS custom properties for timing). */
  className?: string;
  style?: CSSProperties;
  /** Overlays drawn above the figure (arrows). Same user units. */
  children?: ReactNode;
  title?: string;
  paused?: boolean;
}

const STROKE = 2.6;
// The face crop magnifies ~3×; thinner strokes keep the same visual weight.
const STROKE_ZOOM = 1.1;

export function Mannequin({
  view,
  posture,
  eyes,
  zoom,
  lead,
  partClass = {},
  partStyle = {},
  className,
  style,
  children,
  title,
  paused,
}: MannequinProps) {
  const cls = (p: MannequinPart) => partClass[p];
  const sty = (p: MannequinPart) => partStyle[p];
  const seated = posture === "seated";
  const leadPoints = leadMarkers(view, lead);

  return (
    <svg
      viewBox={zoom === "face" ? MANNEQUIN_FACE_VIEWBOX : MANNEQUIN_VIEWBOX}
      className={[s.svg, paused ? s.paused : "", className ?? ""].join(" ")}
      style={style}
      role="img"
      aria-label={title}
      fill="none"
      stroke="currentColor"
      strokeWidth={zoom === "face" ? STROKE_ZOOM : STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}

      {/* Chair (behind the body) */}
      {seated && (
        <g data-part="chair" className={[s.chair, cls("chair") ?? ""].join(" ")} style={sty("chair")}>
          {view === "front" ? (
            <>
              <rect x="74" y="204" width="92" height="10" rx="3" />
              <path d="M80 214 L78 298 M160 214 L162 298" />
              <path d="M86 150 H154" />
            </>
          ) : (
            <>
              <path d="M66 206 H152" strokeWidth={3} />
              <path d="M72 206 V104 Q72 98 78 98 H86" />
              <path d="M76 206 L74 298 M146 206 L148 298" />
            </>
          )}
        </g>
      )}

      {/* Legs (static) */}
      <g data-part="legs" className={cls("legs")} style={sty("legs")}>
        {view === "front" ? (
          seated ? (
            <>
              <path d="M104 206 V214 L102 292 M136 206 V214 L138 292" />
              <path d="M92 292 H112 M128 292 H148" />
            </>
          ) : (
            <>
              <path d="M106 206 L102 300 M134 206 L138 300" />
              <path d="M92 300 H110 M130 300 H148" />
            </>
          )
        ) : (
          <>
            <rect x="110" y="198" width="66" height="16" rx="8" className={s.fillSurface} />
            <path d="M170 214 V292 H194" />
          </>
        )}
      </g>

      {/* Upper body — moves as a block for the trunk exercises */}
      <g
        data-part="upper"
        className={[view === "front" ? s.upperFront : s.upperSide, cls("upper") ?? ""].join(" ")}
        style={sty("upper")}
      >
        {view === "front" ? (
          <>
            {/* left arm (viewer's left) */}
            <g data-part="arm-l" className={cls("arm-l")} style={sty("arm-l")}>
              {seated ? <path d="M94 114 L98 200" /> : <path d="M94 114 L82 198" />}
              <circle cx={seated ? 99 : 81} cy={seated ? 206 : 203} r="4.5" className={s.fillSurface} />
            </g>
            {/* right arm (viewer's right) — pivot at the shoulder (146,112) */}
            <g data-part="arm-r" className={[s.armR, cls("arm-r") ?? ""].join(" ")} style={sty("arm-r")}>
              {seated ? <path d="M146 114 L142 200" /> : <path d="M146 114 L158 198" />}
              <circle cx={seated ? 141 : 159} cy={seated ? 206 : 203} r="4.5" className={s.fillSurface} />
            </g>
            <g data-part="torso" className={[s.torso, cls("torso") ?? ""].join(" ")} style={sty("torso")}>
              <rect x="90" y="104" width="60" height="102" rx="16" className={s.fillSurface} />
            </g>
            <path d="M120 86 V104" />
            <g data-part="head" className={cls("head")} style={sty("head")}>
              <circle cx="120" cy="60" r="26" className={s.fillSurface} />
              {/* ears stay put — the features slide to suggest the turn */}
              <path d="M96 52 Q88 60 96 68 M144 52 Q152 60 144 68" />
              <g data-part="face" className={[s.face, cls("face") ?? ""].join(" ")} style={sty("face")}>
                {eyes === "open" ? (
                  <g data-part="pupils" className={[s.pupils, cls("pupils") ?? ""].join(" ")} style={sty("pupils")}>
                    <circle cx="110" cy="57" r="2.8" className={s.fillInk} stroke="none" />
                    <circle cx="130" cy="57" r="2.8" className={s.fillInk} stroke="none" />
                  </g>
                ) : (
                  <>
                    {/* ghost pupils under the lids: where the gaze goes */}
                    <g data-part="pupils" className={[s.pupils, s.ghost, cls("pupils") ?? ""].join(" ")} style={sty("pupils")}>
                      <circle cx="110" cy="58" r="2.8" className={s.fillInk} stroke="none" />
                      <circle cx="130" cy="58" r="2.8" className={s.fillInk} stroke="none" />
                    </g>
                    <path d="M104 57 Q110 62 116 57 M124 57 Q130 62 136 57" />
                  </>
                )}
                <path d="M120 62 V70" />
                <path d="M113 77 Q120 81 127 77" />
              </g>
            </g>
          </>
        ) : (
          <>
            <g data-part="arm-r" className={cls("arm-r")} style={sty("arm-r")}>
              <path d="M118 116 L150 190" />
              <circle cx="152" cy="194" r="4.5" className={s.fillSurface} />
            </g>
            <g data-part="torso" className={[s.torso, cls("torso") ?? ""].join(" ")} style={sty("torso")}>
              <rect x="100" y="104" width="38" height="104" rx="14" className={s.fillSurface} />
            </g>
            <path d="M121 86 V104" />
            <g data-part="head" className={cls("head")} style={sty("head")}>
              <circle cx="122" cy="60" r="26" className={s.fillSurface} />
              <path d="M120 52 Q112 60 120 68" />
              <g data-part="face" className={cls("face")} style={sty("face")}>
                {eyes === "open" ? (
                  <circle cx="138" cy="56" r="2.8" className={s.fillInk} stroke="none" />
                ) : (
                  <path d="M133 57 Q138 61 143 57" />
                )}
                <path d="M146 60 L152 65 L146 68" />
              </g>
            </g>
          </>
        )}
      </g>

      {/* Lead ("punto de arranque") markers */}
      {leadPoints.map(([x, y], i) => (
        <g key={i} className={s.lead} style={{ animationDelay: `${i * 0.2}s` }}>
          <circle cx={x} cy={y} r="9" className={s.leadRing} />
          <circle cx={x} cy={y} r="3.2" className={s.leadDot} stroke="none" />
        </g>
      ))}

      {children}
    </svg>
  );
}

function leadMarkers(view: MannequinView, lead?: WarmupLead): Array<[number, number]> {
  if (!lead) return [];
  const front: Record<WarmupLead, Array<[number, number]>> = {
    head: [[120, 34]],
    nose: [[120, 66]],
    ear: [[150, 60]],
    shoulders: [[150, 110]],
    pelvis: [[120, 206]],
    hip: [[146, 204]],
    all: [
      [120, 34],
      [150, 110],
      [146, 204],
    ],
  };
  const side: Record<WarmupLead, Array<[number, number]>> = {
    head: [[122, 32]],
    nose: [[150, 64]],
    ear: [[116, 60]],
    shoulders: [[118, 108]],
    pelvis: [[118, 204]],
    hip: [[118, 204]],
    all: [
      [122, 32],
      [118, 108],
      [118, 204],
    ],
  };
  return (view === "front" ? front : side)[lead];
}
