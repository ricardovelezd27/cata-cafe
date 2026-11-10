// DRAFT terms of use (S8-08, F-landing-1). Placeholder structure only, NOT
// legal advice and NOT final: the owner pastes the approved wording here.
// TODO(owner): paste final terms text (es, en), bump CONSENT_NOTICE_VERSION.
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import type { LegalDocs } from "./types";

export const TERMS: LegalDocs = {
  es: {
    title: "Términos de uso",
    sections: [
      {
        heading: "El servicio",
        body: [
          "Café Sensible es una herramienta para organizar catas y registrar evaluaciones sensoriales. [por confirmar: descripción final del servicio].",
        ],
      },
      {
        heading: "Tu cuenta y tu contenido",
        body: [
          "Eres responsable de lo que introduces. Quien crea una cata, un café o un grupo puede editarlo y borrarlo; los participantes solo toman parte. [por confirmar: licencia sobre el contenido].",
        ],
      },
      {
        heading: "Plazas fundadoras",
        body: ["[por confirmar: condiciones de la oferta fundadora]."],
      },
      {
        heading: "Contacto",
        body: [`Dudas sobre estos términos: ${SUPPORT_EMAIL}.`],
      },
    ],
  },
  en: {
    title: "Terms of use",
    sections: [
      {
        heading: "The service",
        body: [
          "Café Sensible is a tool for running cuppings and recording sensory evaluations. [to confirm: final description of the service].",
        ],
      },
      {
        heading: "Your account and your content",
        body: [
          "You are responsible for what you enter. Whoever creates a cupping, a coffee or a group can edit and delete it; participants only take part. [to confirm: content licence].",
        ],
      },
      {
        heading: "Founding seats",
        body: ["[to confirm: terms of the founding offer]."],
      },
      {
        heading: "Contact",
        body: [`Questions about these terms: ${SUPPORT_EMAIL}.`],
      },
    ],
  },
};
