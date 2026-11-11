// Founding-cohort size, in ONE place (S8-14, F-landing-5). The landing copy
// ("Gratis para los primeros {count} miembros fundadores", the hero counter)
// reads it. `reserveFoundingSeat` (app/actions/waitlist.ts) deliberately does
// NOT enforce it: every address gets its magic link and an idempotent row, and
// whether a 101st signup is turned away is the owner's call.
export const FOUNDING_SEATS = 100;
