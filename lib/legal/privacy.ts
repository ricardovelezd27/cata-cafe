// DRAFT privacy notice (S8-08, F-landing-1). Placeholder structure only, NOT
// legal advice and NOT final: the owner pastes the approved wording here.
// Statements below only restate what the product does today (see
// docs/audits/flows-2026-11/18-landing.md); every "[por confirmar]" /
// "[to confirm]" marks a decision that belongs to the owner.
// TODO(owner): paste final privacy text (es, en), bump CONSENT_NOTICE_VERSION.
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import { WAITLIST_RETENTION_MONTHS } from "./config";
import type { LegalDocs } from "./types";

export const PRIVACY: LegalDocs = {
  es: {
    title: "Política de privacidad",
    sections: [
      {
        heading: "Quién trata tus datos",
        body: ["[por confirmar: razón social, domicilio y datos de contacto del responsable]."],
      },
      {
        heading: "Qué datos guardamos",
        body: [
          "Tu correo electrónico cuando reservas una plaza fundadora o creas una cuenta, y los datos que tú mismo introduces en la aplicación (perfil, catas, evaluaciones, cafés).",
        ],
      },
      {
        heading: "Para qué los usamos",
        body: [
          "Para enviarte el enlace de acceso, avisarte cuando se agoten las plazas fundadoras y prestarte el servicio. [por confirmar: base jurídica].",
        ],
      },
      {
        heading: "Cuánto tiempo los conservamos",
        body: [
          `[por confirmar] Si solo reservaste plaza y no creaste cuenta, conservamos el correo hasta ${WAITLIST_RETENTION_MONTHS} meses. Si borras tu cuenta, se elimina también esa reserva.`,
        ],
      },
      {
        heading: "Tus derechos",
        body: [
          `Puedes pedir acceso, rectificación o supresión de tus datos escribiendo a ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
  en: {
    title: "Privacy policy",
    sections: [
      {
        heading: "Who handles your data",
        body: ["[to confirm: legal entity, address and contact details of the controller]."],
      },
      {
        heading: "What we store",
        body: [
          "Your email address when you reserve a founding seat or create an account, and the data you enter in the app (profile, cuppings, evaluations, coffees).",
        ],
      },
      {
        heading: "What we use it for",
        body: [
          "To send you the sign-in link, tell you when founding seats run out and provide the service. [to confirm: legal basis].",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          `[to confirm] If you only reserved a seat and never created an account, we keep the address for up to ${WAITLIST_RETENTION_MONTHS} months. If you delete your account, that reservation is removed too.`,
        ],
      },
      {
        heading: "Your rights",
        body: [
          `You can ask for access, correction or deletion of your data by writing to ${SUPPORT_EMAIL}.`,
        ],
      },
    ],
  },
};
