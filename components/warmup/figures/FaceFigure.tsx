import { useId } from "react";
import { partTransforms } from "@/lib/warmup/poses";
import { Trajectory } from "./Trajectory";
import s from "./figures.module.css";
import { THUMB_VIEWBOX, cx, svgId, type FigureProps } from "./shared";

// Faint gaze guide rails: horizontal along the top, vertical on the right.
const RAIL_X = Array.from({ length: 11 }, (_, i) => 60 + i * 8); // 60..140 at y 14
const RAIL_Y = Array.from({ length: 10 }, (_, i) => 40 + i * 10); // 40..130 at x 186

/**
 * Ejercicio 2 · Los ojos — head-and-shoulders bust (viewBox 0 0 200 200).
 * Only the pupil glow moves: `<g data-part="pupils">` gets
 * `translate(10a 6b)` (poses.partTransforms / GEO.eyes). The glow is clipped
 * to two fixed almond sockets by an UNtransformed wrapper, so it fades out at
 * the socket edge instead of sliding across the cheek.
 */
export function FaceFigure({ eyes, highlight = true, pose, path, frame = "stage", title, className, ref }: FigureProps) {
  const uid = useId();
  const clipId = svgId(uid, "wu-sockets");
  const glowId = svgId(uid, "wu-glow");
  const transforms = pose ? partTransforms("eyes", pose) : {};
  const stop = highlight ? s.glowStop : s.glowStopRest;

  return (
    <svg
      ref={ref}
      viewBox={frame === "tile" ? THUMB_VIEWBOX.face : "0 0 200 200"}
      className={cx(s.svg, className)}
      role="img"
      aria-label={title}
      data-kind="eyes"
      data-eyes={eyes}
      data-frame={frame}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={clipId}>
          <ellipse cx={78} cy={86} rx={14} ry={8} />
          <ellipse cx={122} cy={86} rx={14} ry={8} />
        </clipPath>
        {/* Solid core to 30 % of the radius, then fades to nothing. */}
        <radialGradient id={glowId}>
          <stop offset="0" className={stop} stopOpacity={1} />
          <stop offset="0.3" className={stop} stopOpacity={1} />
          <stop offset="1" className={stop} stopOpacity={0} />
        </radialGradient>
      </defs>

      <g data-part="head" className={s.rest}>
        <path className={s.fill} d="M20 200 Q24 160 70 152 H130 Q176 160 180 200Z" />
        <rect className={s.fill} x={84} y={128} width={32} height={30} rx={12} />
        <ellipse className={s.fill} cx={48} cy={86} rx={7} ry={12} />
        <ellipse className={s.fill} cx={152} cy={86} rx={7} ry={12} />
        <ellipse className={s.fill} cx={100} cy={86} rx={52} ry={62} />

        <g clipPath={`url(#${clipId})`}>
          <g data-part="pupils" transform={transforms.pupils}>
            <circle cx={78} cy={86} r={7} fill={`url(#${glowId})`} />
            <circle cx={122} cy={86} r={7} fill={`url(#${glowId})`} />
          </g>
        </g>

        {eyes === "closed" ? (
          <path className={s.eyeLine} d="M66 84 Q78 92 90 84 M110 84 Q122 92 134 84" />
        ) : (
          <path className={s.eyeLine} d="M64 86 Q78 75 92 86 Q78 97 64 86Z M108 86 Q122 75 136 86 Q122 97 108 86Z" />
        )}

        <path className={s.nose} d="M100 93 Q104 102 100 111 Q96 102 100 93Z" />
      </g>

      {path && (
        <>
          <g aria-hidden className={s.gazeGuide}>
            {RAIL_X.map((x) => (
              <circle key={`h${x}`} cx={x} cy={14} r={1.2} />
            ))}
            {RAIL_Y.map((y) => (
              <circle key={`v${y}`} cx={186} cy={y} r={1.2} />
            ))}
          </g>
          <Trajectory kind="eyes" from={path.from} to={path.to} progress={path.progress} dotR={1.2} destR={4} />
        </>
      )}
    </svg>
  );
}
