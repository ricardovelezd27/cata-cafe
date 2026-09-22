import Image from "next/image";

type Aspect = "4/3" | "3/4" | "16/10" | "3/2";

const ASPECT_CLASSES: Record<Aspect, string> = {
  "4/3": "aspect-[4/3]",
  "3/4": "aspect-[3/4]",
  "16/10": "aspect-[16/10]",
  "3/2": "aspect-[3/2]",
};

/** Framed real-session photo on the dark stage; without `src` it renders the empty dot-grid frame. */
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
  position?: "center" | "top";
  sizes: string;
  className?: string;
  priority?: never;
}) {
  return (
    <figure className={className}>
      <div
        className={`stage-card relative overflow-hidden rounded-[2rem] ${ASPECT_CLASSES[aspect]}`}
      >
        {src ? (
          <Image
            src={src}
            alt={alt}
            fill
            sizes={sizes}
            className={position === "top" ? "object-cover object-top" : "object-cover"}
          />
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
