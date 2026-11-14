import Image from "next/image";

type Aspect = "4/3" | "3/4" | "4/5" | "16/10" | "3/2";

const ASPECT_CLASSES: Record<Aspect, string> = {
  "4/3": "aspect-[4/3]",
  "3/4": "aspect-[3/4]",
  "4/5": "aspect-[4/5]",
  "16/10": "aspect-[16/10]",
  "3/2": "aspect-[3/2]",
};

// Focal point of the crop. Static class names only (Tailwind scans the source).
const POSITION_CLASSES = {
  center: "object-center",
  top: "object-top",
  left: "object-left",
  right: "object-right",
} as const;

export type PhotoPosition = keyof typeof POSITION_CLASSES;

/**
 * A real-session photo as the PHOTO surface (DESIGN.md "Stage and surfaces"):
 * the picture, a green veil rising from the bottom and a static grain, so
 * photos taken in different rooms read as one family on the stage. Never
 * glass on the frame itself. Without `src` it renders the empty dot grid.
 */
export default function PhotoSlot({
  src,
  alt,
  caption,
  aspect = "4/3",
  position = "center",
  sizes,
  className,
}: {
  src?: string;
  alt: string;
  caption?: string;
  aspect?: Aspect;
  /** object-position for cropped sources (portrait originals keep faces with "top") */
  position?: PhotoPosition;
  sizes: string;
  className?: string;
  priority?: never;
}) {
  return (
    <figure className={className}>
      <div className={`surface-photo rounded-lg ${ASPECT_CLASSES[aspect]}`}>
        {src ? (
          <>
            <Image
              src={src}
              alt={alt}
              fill
              sizes={sizes}
              className={`object-cover ${POSITION_CLASSES[position]}`}
            />
            <span aria-hidden="true" className="surface-photo-veil" />
          </>
        ) : (
          <div
            role="img"
            aria-label={alt}
            className="photo-slot-empty absolute inset-0"
          />
        )}
      </div>
      {caption ? (
        <figcaption className="mt-2 text-xs text-surface/60">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
