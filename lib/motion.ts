/**
 * Reduced motion for script-driven scrolling (audit G-01).
 *
 * The CSS reset in `app/globals.css` cannot reach `scrollIntoView({ behavior:
 * "smooth" })`: an explicit `behavior` wins over `scroll-behavior`. Every
 * scripted smooth scroll of the paper app asks this instead.
 */

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Pure rule: "auto" (a jump) when reduced motion is asked for, else "smooth". */
export function scrollBehaviorFor(reduced: boolean): ScrollBehavior {
  return reduced ? "auto" : "smooth";
}

/** True when the OS asks for reduced motion. False on the server or without matchMedia. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
}

/** The behavior to pass to `scrollIntoView` / `scrollTo` at the moment of the call. */
export function scrollBehavior(): ScrollBehavior {
  return scrollBehaviorFor(prefersReducedMotion());
}
