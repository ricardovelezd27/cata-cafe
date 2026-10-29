import { useId, type Ref } from "react";
import type { WarmupFigureKind, WarmupLead } from "@/lib/warmup/exercises";
import type { PartTransforms } from "@/lib/warmup/poses";
import type { Pose } from "@/lib/warmup/timelineTypes";
import { Trajectory } from "./Trajectory";
import s from "./figures.module.css";
import { THUMB_VIEWBOX, cx, svgId } from "./shared";

/**
 * Soft filled silhouette shared by the four full-body warm-up figures.
 *
 *  - "front": faces the viewer. MIRROR semantics — "derecha" moves toward
 *    the VIEWER's right, like a mirror in a movement studio.
 *  - "side": profile facing right = forward (trunk forward/back).
 *
 * No outlines: every part is an opaque fill (or a round-capped stroke of the
 * same tone). Moving groups carry `data-part`; the player writes their SVG
 * `transform` ATTRIBUTE per frame (pivots in lib/warmup/poses.ts GEO). A
 * static `transforms` record does the same at render time for tiles.
 *
 * viewBox 0 0 240 320. Pivots: arm-r (146,112) · side upper (118,206).
 */

export type MannequinView = "front" | "side";
export type MovingPart = "arm-r" | "head" | "upper";
type Part = "head" | "neck" | "torso" | "arm-l" | "arm-r" | "legs";
export type LeadHost = "face" | "head" | "upper" | "arm-r";

export interface LeadDot {
  host: LeadHost;
  x: number;
  y: number;
}

export const MANNEQUIN_VIEWBOX = "0 0 240 320";

const UPPER_PARTS = new Set<Part>(["head", "neck", "torso", "arm-l", "arm-r"]);

export interface MannequinProps {
  kind: WarmupFigureKind;
  view: MannequinView;
  posture: "seated" | "standing";
  eyes: "open" | "closed";
  frame: "stage" | "tile";
  /** Part drawn in --wu-move (undefined = nothing highlighted). */
  moving?: MovingPart;
  /** Static transform attributes per data-part (poses.partTransforms). */
  transforms: PartTransforms;
  leads: LeadDot[];
  path?: { from: Pose; to: Pose; progress?: number } | null;
  title?: string;
  className?: string;
  ref?: Ref<SVGSVGElement>;
}

export function Mannequin({
  kind,
  view,
  posture,
  eyes,
  frame,
  moving,
  transforms,
  leads,
  path,
  title,
  className,
  ref,
}: MannequinProps) {
  const haloId = svgId(useId(), "wu-halo");
  const seated = posture === "seated";
  const front = view === "front";
  const tile = frame === "tile";
  /** Fine apron details (ties, straps, logo) vanish below ~1 px in tiles. */
  const detail = !tile;

  const tone = (p: Part): string => {
    if (!moving) return s.rest;
    if (moving === "upper" && UPPER_PARTS.has(p)) return s.moveSoft;
    return p === moving ? s.move : s.rest;
  };
  const leadsIn = (host: LeadHost) =>
    leads
      .filter((l) => l.host === host)
      .map((l, i) => (
        <g key={`${host}-${i}`} data-lead="">
          <circle className={s.leadHalo} cx={l.x} cy={l.y} r={4.5} />
          <circle className={s.leadDot} cx={l.x} cy={l.y} r={4.5} />
        </g>
      ));

  return (
    <svg
      ref={ref}
      viewBox={tile ? THUMB_VIEWBOX[posture] : MANNEQUIN_VIEWBOX}
      className={cx(s.svg, className)}
      role="img"
      aria-label={title}
      data-kind={kind}
      data-eyes={eyes}
      data-frame={frame}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={haloId}>
          <stop offset="0" className={s.haloStop} stopOpacity={0.08} />
          <stop offset="1" className={s.haloStop} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Floor halo: weight, not decoration */}
      <ellipse cx={front ? 120 : 130} cy={302} rx={front ? 80 : 90} ry={8} fill={`url(#${haloId})`} />

      {/* Chair — one solid tone behind the body */}
      {seated && (
        <g data-part="chair" className={s.chair}>
          {front ? (
            <>
              <rect x={70} y={204} width={100} height={10} rx={5} />
              <rect x={78} y={208} width={6} height={90} rx={3} />
              <rect x={156} y={208} width={6} height={90} rx={3} />
            </>
          ) : (
            <>
              <rect x={66} y={104} width={10} height={106} rx={5} />
              <rect x={64} y={206} width={92} height={10} rx={5} />
              <rect x={70} y={210} width={6} height={88} rx={3} />
              <rect x={144} y={210} width={6} height={88} rx={3} />
            </>
          )}
        </g>
      )}

      {/* Legs (static) */}
      <g data-part="legs" className={tone("legs")}>
        {front ? (
          <path
            className={s.line}
            strokeWidth={16}
            d={seated ? "M104 206 L102 292 M136 206 L138 292" : "M108 204 L104 296 M132 204 L136 296"}
          />
        ) : (
          <>
            <path className={s.line} strokeWidth={16} d="M120 204 H170 M172 206 V290" />
            <path className={s.line} strokeWidth={12} d="M172 292 H190" />
          </>
        )}
      </g>

      {/* Upper body — moves as a block for the trunk exercises */}
      <g data-part="upper" transform={transforms.upper}>
        {front && (
          <g data-part="arm-l" className={tone("arm-l")}>
            {seated ? (
              <>
                <path className={s.line} strokeWidth={14} d="M94 114 L98 200" />
                <circle className={s.fill} cx={98} cy={200} r={7.5} />
              </>
            ) : (
              <>
                <path className={s.line} strokeWidth={14} d="M94 114 L82 198" />
                <circle className={s.fill} cx={82} cy={198} r={7.5} />
              </>
            )}
          </g>
        )}

        <g data-part="torso" transform={transforms.torso} className={tone("torso")}>
          {front ? (
            <>
              <path
                className={s.fill}
                d="M92 116 Q92 102 106 102 H134 Q148 102 148 116 L142 196 Q142 208 130 208 H110 Q98 208 98 196Z"
              />
              {/* Barista apron: waist tie, neck straps (tucked under the neck
                  cap), bib widening to a skirt, coffee-bean mark on the bib. */}
              <g className={s.apron}>
                {detail && <path className={s.apronLine} strokeWidth={2.4} d="M96.5 150 H143.5" />}
                {detail && <path className={s.apronLine} strokeWidth={1.8} d="M110.5 118 L116 104 M129.5 118 L124 104" />}
                <path d="M111 117 H129 Q132 117 132.2 120 L133.5 150 L139 193 Q139.6 199 133.5 199 H106.5 Q100.4 199 101 193 L106.5 150 L107.8 120 Q108 117 111 117Z" />
                {detail && (
                  <g transform="rotate(18 120 132)">
                    <ellipse className={s.logo} cx={120} cy={132} rx={4} ry={5.5} />
                    <path className={s.logoCrease} d="M120.9 127.4 C118.4 129.6 122.2 134 119.3 136.6" />
                  </g>
                )}
              </g>
            </>
          ) : (
            <>
              <rect className={s.fill} x={100} y={102} width={40} height={106} rx={20} />
              {/* Apron in profile: a strip down the front of the torso. */}
              <g className={s.apron}>
                {detail && <path className={s.apronLine} strokeWidth={2.2} d="M102 150 H130" />}
                {detail && <path className={s.apronLine} strokeWidth={1.8} d="M133.5 118 L125.5 104" />}
                <path d="M132 117 H138.5 Q141.6 117 141.7 121 L142.4 188 Q142.4 198 132 199 H125 Q127.5 160 132 117Z" />
              </g>
            </>
          )}
        </g>

        <g className={tone("neck")}>
          <path className={s.line} strokeWidth={12} d={front ? "M120 80 V102" : "M121 80 V102"} />
        </g>

        <g data-part="head" className={tone("head")}>
          {front ? (
            <>
              {/* Ears and hair stay put when the head turns; only the features slide. */}
              <ellipse className={s.fill} cx={96} cy={60} rx={4} ry={7} />
              <ellipse className={s.fill} cx={144} cy={60} rx={4} ry={7} />
              <circle className={s.hair} cx={120} cy={33} r={6} />
              <circle className={s.fill} cx={120} cy={58} r={24} />
              {/* Hair cap with a soft side-parted fringe. */}
              <path
                className={s.hair}
                d="M95.7 52 A25 25 0 0 1 144.3 52 C141 44.5 133 40.5 123 41 C110 41.5 99.5 44.5 95.7 52Z"
              />
            </>
          ) : (
            <>
              {/* Low bun at the back of the head. */}
              <circle className={s.hair} cx={97} cy={50} r={7} />
              <circle className={s.fill} cx={122} cy={58} r={24} />
              <path
                className={s.hair}
                d="M98 64 A25 25 0 0 1 140.5 41 Q127 42 116 48 Q108 53 106 68 Q101 68 98 64Z"
              />
              <ellipse className={s.nose} cx={116} cy={59} rx={3.2} ry={5} />
              <path className={s.fill} d="M145 52.5 Q153 59 145.5 62.5Z" />
            </>
          )}

          <g data-part="face" transform={transforms.face}>
            {front ? (
              <>
                {eyes === "closed" ? (
                  <path className={s.eyeLine} d="M106 55 Q111 59 116 55 M124 55 Q129 59 134 55" />
                ) : (
                  <>
                    <circle className={s.eyeDot} cx={111} cy={56} r={1.9} />
                    <circle className={s.eyeDot} cx={129} cy={56} r={1.9} />
                  </>
                )}
                <path className={s.noseLine} d="M120.2 60.5 Q117.8 64.4 120.6 65.8" />
                <path className={s.mouth} strokeWidth={1.4} d="M116 71 Q120 74 124 71" />
              </>
            ) : (
              <>
                {eyes === "closed" ? (
                  <path className={s.eyeLine} d="M131 54 Q135 57 139 54" />
                ) : (
                  <circle className={s.eyeDot} cx={135} cy={55} r={1.9} />
                )}
                <path className={s.mouth} strokeWidth={1.4} d="M137.5 70 Q140 72 142 70.4" />
              </>
            )}
            {leadsIn("face")}
          </g>
          {leadsIn("head")}
        </g>

        <g data-part="arm-r" transform={transforms["arm-r"]} className={tone("arm-r")}>
          {front ? (
            seated ? (
              <>
                <path className={s.line} strokeWidth={14} d="M146 114 L142 200" />
                <circle className={s.fill} cx={142} cy={200} r={7.5} />
              </>
            ) : (
              <>
                <path className={s.line} strokeWidth={14} d="M146 114 L158 198" />
                <circle className={s.fill} cx={158} cy={198} r={7.5} />
              </>
            )
          ) : (
            <>
              <path className={s.line} strokeWidth={14} d="M118 116 L150 190" />
              <circle className={s.fill} cx={150} cy={190} r={7.5} />
            </>
          )}
          {leadsIn("arm-r")}
        </g>

        {leadsIn("upper")}
      </g>

      {path && (
        <Trajectory
          kind={kind}
          from={path.from}
          to={path.to}
          progress={path.progress}
          // Tiles shrink ~5x: bigger, sparser dots so the route still reads.
          dotR={tile ? 4 : 1.6}
          destR={tile ? 10 : 6}
          spacing={tile ? 16 : undefined}
        />
      )}
    </svg>
  );
}

/** Where the lead dot(s) sit and which group carries them, so they move with
 *  the part that leads. `headOnly` (head-rotate): "all" = the whole head
 *  (nose + both ears), not shoulders/hips that do not move. */
export function leadDots(view: MannequinView, lead: WarmupLead | undefined, headOnly = false): LeadDot[] {
  if (!lead) return [];
  const front = view === "front";
  const P: Record<Exclude<WarmupLead, "all">, LeadDot> = front
    ? {
        head: { host: "head", x: 120, y: 34 },
        nose: { host: "face", x: 120, y: 66 },
        ear: { host: "head", x: 144, y: 60 },
        shoulders: { host: "upper", x: 146, y: 110 },
        pelvis: { host: "upper", x: 120, y: 204 },
        hip: { host: "upper", x: 144, y: 202 },
      }
    : {
        head: { host: "head", x: 122, y: 34 },
        nose: { host: "face", x: 151, y: 58 },
        ear: { host: "head", x: 118, y: 58 },
        shoulders: { host: "upper", x: 120, y: 108 },
        pelvis: { host: "upper", x: 120, y: 204 },
        hip: { host: "upper", x: 120, y: 204 },
      };
  if (lead !== "all") return [P[lead]];
  if (headOnly) return [P.nose, { host: "head", x: 96, y: 60 }, P.ear];
  return [P.head, P.shoulders, front ? P.hip : P.pelvis];
}
