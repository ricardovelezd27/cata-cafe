import type { PhotoPosition } from "./PhotoSlot";

// The five real-session photos (public/landing/real/). Sources are small
// (480 to 640 px wide), so a card never shows one wider than about 320 px.
export const AUDIENCE_PHOTOS = {
  "01": "/landing/real/01-mesa-socios.jpg", // a taster with a paper cup, phone in hand
  "02": "/landing/real/02-mesa-cata-app.jpg", // cupping table, people logging on phones
  "03": "/landing/real/03-sala-socios.jpg", // U-shaped table, a whole room at work
  "04": "/landing/real/04-taller-grupo.jpg", // live workshop, spoons and notebooks
  "05": "/landing/real/05-slurp.jpg", // cuppers bent over the bowls, flavor wheel behind
} as const;

export type AudiencePhoto = keyof typeof AUDIENCE_PHOTOS;

export interface AudienceCard {
  /** which photo this audience gets */
  photo: AudiencePhoto;
  /** which part of the photo survives the 4:5 crop */
  position: PhotoPosition;
}

/**
 * One entry per audience, in the order of `landing.audience.card1..card5`:
 * Formadores, Escuelas, Tostadores, Cooperativas, Importadores.
 *
 * Which photo stands for which audience, and the focal point of each crop
 * ("center" | "top" | "left" | "right"). The photos show workshops, not
 * literally roasters or importers, so the pairing is by mood: who would
 * recognise themselves in that room? This pairing was chosen when the page
 * was built (2026-11-14) and has not been reviewed by the owner; change it
 * here, nothing else depends on it (the alt text follows the photo).
 */
export const AUDIENCE_CARDS: readonly AudienceCard[] = [
  { photo: "04", position: "center" }, // Formadores y facilitadores
  { photo: "05", position: "center" }, // Escuelas
  { photo: "02", position: "top" }, // Tostadores
  { photo: "03", position: "left" }, // Cooperativas
  { photo: "01", position: "right" }, // Importadores
];
