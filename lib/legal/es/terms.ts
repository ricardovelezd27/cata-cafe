// Términos y condiciones (es). SOURCE: the owner's "Términos y Condiciones"
// v1.0 (April 2026), written for another product of the same company.
// ADAPTATION RULES (owner's decision, 2026-11-12): keep parties, account
// duties, prohibited uses, intellectual property, liability, changes,
// termination, data protection, law and jurisdiction; change product name and
// domain; remove ONLY the sections about features Café Sensible does not have
// (paid plans and billing, marketplace, AI scanner, gamified learning).
// Paragraphs marked ADDED are not in the source and need the owner's eye.
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import { LEGAL_ENTITY, LEGAL_TEXT_VERSION } from "../company";
import type { LegalDoc } from "../types";

const E = LEGAL_ENTITY;

export const TERMS_ES: LegalDoc = {
  title: "Términos y condiciones",
  version: LEGAL_TEXT_VERSION.es,
  intro: [
    `Los presentes Términos y Condiciones (en adelante, «T&C») regulan el acceso, registro y uso de la plataforma ${E.product}, accesible en ${E.site} (en adelante, «la Plataforma»), operada por ${E.name}.`,
    "Al acceder o utilizar la Plataforma, el usuario acepta íntegramente los presentes T&C. Si no está de acuerdo con alguno de sus términos, debe abstenerse de utilizar la Plataforma.",
  ],
  sections: [
    {
      heading: "1. Partes del contrato",
      body: [
        {
          rows: [
            ["Prestador del servicio", `${E.name} — CIF ${E.cif}`],
            ["Domicilio social", E.address],
            ["Contacto", SUPPORT_EMAIL],
            ["Usuario", "Toda persona física mayor de 14 años que acceda, se registre o use la Plataforma"],
            ["Relación", "Contrato de prestación de servicios digitales a distancia (LGDCU art. 92 y ss.; LSSI-CE art. 23)"],
          ],
        },
      ],
    },
    {
      // ADAPTED: the source describes a catalogue, an AI scanner, a learning
      // module and a marketplace. This describes what Café Sensible offers.
      heading: "2. Objeto del servicio",
      body: [
        `${E.product} es una plataforma digital para organizar catas de café y registrar evaluaciones sensoriales. Ofrece los siguientes servicios:`,
        {
          list: [
            "Sesiones de cata: creación de catas individuales o en grupo, a ciegas, con invitación por enlace o código QR.",
            "Evaluación sensorial: formularios descriptivos y afectivos basados en la metodología CVA de la SCA, con cálculo de puntajes.",
            "Resultados e informes: resultados individuales y de grupo, e informes en PDF.",
            "Cafés y grupos: registro de cafés con sus datos de origen y grupos de cata para organizar a las personas que catan juntas.",
            "Movimiento Sensorial: ejercicios guiados de preparación antes de catar.",
          ],
        },
        // ADDED: there are no paid plans today; the source's billing section was removed.
        "Actualmente el acceso a la Plataforma es gratuito. Si en el futuro se ofrecen planes de pago, sus condiciones y precios se comunicarán antes de cualquier contratación.",
      ],
    },
    {
      heading: "3. Registro de cuenta y obligaciones del usuario",
      body: [
        { sub: "3.1 Requisitos de registro" },
        {
          list: [
            "El usuario debe ser mayor de 14 años. Los menores de 14 años requieren consentimiento expreso de sus tutores legales.",
            // ADAPTED: the source asks for a password; access here is by link, code or Google.
            "El usuario debe proporcionar una dirección de correo electrónico válida. El acceso se realiza con un enlace o un código enviado a ese correo, o con una cuenta de Google.",
            "Cada persona física podrá mantener una única cuenta activa, salvo autorización expresa del prestador.",
            "La cuenta es personal e intransferible.",
            // ADDED: guests.
            "Se puede participar en una cata como invitado, sin cuenta, indicando un nombre. El acceso de un invitado queda ligado al navegador que usó y se pierde si borra sus datos de navegación, salvo que guarde sus resultados creando una cuenta.",
          ],
        },
        { sub: "3.2 Obligaciones del usuario" },
        {
          list: [
            `Mantener el control de su correo electrónico y de sus enlaces de acceso, y notificar inmediatamente cualquier uso no autorizado a ${SUPPORT_EMAIL}.`,
            "Proporcionar información veraz, completa y actualizada en el registro y perfil.",
            "Usar la Plataforma de conformidad con la legislación aplicable, la buena fe y el orden público.",
            "No compartir, vender ni transferir el acceso a su cuenta a terceros.",
            // ADDED: owners enter other people's data (group emails, producers).
            "Si introduce datos de otras personas (por ejemplo, las direcciones de correo de un grupo de cata o los datos de un productor), garantizar que está autorizado para hacerlo.",
          ],
        },
        { sub: "3.3 Usos prohibidos" },
        "Queda expresamente prohibido:",
        {
          list: [
            "Utilizar la Plataforma para actividades ilegales, fraudulentas o que vulneren derechos de terceros.",
            "Publicar contenidos difamatorios, obscenos, discriminatorios o que infrinjan derechos de propiedad intelectual.",
            "Realizar ingeniería inversa, descompilar o extraer el código fuente de la aplicación.",
            "Usar bots, scrapers o herramientas automatizadas para acceder o extraer datos de la Plataforma.",
            "Suplantar la identidad de otro usuario o entidad.",
            "Interferir con los sistemas de seguridad o la infraestructura técnica de la Plataforma.",
            "Crear múltiples cuentas para eludir suspensiones o restricciones previas.",
          ],
        },
      ],
    },
    {
      // ADDED: the owner / participant rule that the product applies everywhere.
      heading: "4. Catas, organizadores y participantes",
      body: [
        "Quien crea una cata, un café o un grupo es su organizador: puede editarlo y eliminarlo, e invitar o excluir participantes; en una cata, también cerrarla. Eliminar un café retira sus datos identificativos, pero conserva las evaluaciones que otras personas hicieron de él. Los participantes toman parte en la cata y ven sus propios resultados; los resultados del grupo se muestran cuando la cata termina.",
        "Una cata cerrada queda como registro: nadie puede cambiar las evaluaciones ya enviadas. El organizador puede hacer correcciones acotadas después del cierre (por ejemplo, excluir a un participante o completar los datos de origen de un café); los resultados indican entonces la fecha de actualización. Si un participante suprime su cuenta, sus evaluaciones en catas compartidas se conservan sin su nombre, para que los resultados de los demás no cambien.",
        // ADAPTED from the source's "no professional certification" clause for its learning module.
        "Los puntajes e informes de la Plataforma tienen fines formativos y de trabajo. No constituyen una certificación profesional ni equivalen a una evaluación acreditada por ningún organismo oficial.",
      ],
    },
    {
      heading: "5. Propiedad intelectual",
      body: [
        `5.1 Titularidad de contenidos. Todos los contenidos de la Plataforma — incluyendo el código fuente, diseño, logotipos, ejercicios, textos y datos de referencia — son propiedad de ${E.name} o están licenciados por terceros, y están protegidos por la Ley de Propiedad Intelectual (Real Decreto Legislativo 1/1996) y normativa internacional.`,
        // ADAPTED: the source limits the licence to "fines personales y no comerciales".
        // Dropped here because this product is used professionally (courses, labs, producers).
        `5.2 Licencia de uso. ${E.name} otorga al usuario una licencia personal, no exclusiva, intransferible y revocable para acceder y usar la Plataforma en los términos previstos en estos T&C.`,
        `5.3 Contenido generado por el usuario. El usuario conserva la titularidad de las evaluaciones, notas de cata, fichas de café y valoraciones que publique en la Plataforma. Al publicarlos, otorga a ${E.name} una licencia mundial, no exclusiva, gratuita, sublicenciable y transferible para reproducir, distribuir, mostrar y adaptar dicho contenido en el contexto del funcionamiento y promoción de la Plataforma.`,
        "El usuario garantiza que el contenido que publica no infringe derechos de terceros y asume plena responsabilidad por el mismo.",
      ],
    },
    {
      // ADDED: replaces the source's subscription terms. The founding offer's
      // conditions are the owner's to write.
      heading: "6. Plazas fundadoras",
      body: [
        "Reservar una plaza fundadora no implica ningún pago ni compromiso de contratación. Las condiciones de la oferta fundadora se comunicarán a quienes hayan reservado plaza antes de que entren en vigor.",
      ],
    },
    {
      heading: "7. Inteligencia artificial",
      body: [
        // ADAPTED: the source's AI clause is about a packaging scanner.
        `Algunas funciones del área de análisis generan textos con inteligencia artificial (modelo Gemini de Google LLC). ${E.name} actúa como «responsable del despliegue» y Google LLC como «proveedor» del modelo (Reglamento (UE) 2024/1689). Los resultados tienen carácter meramente informativo y pueden contener imprecisiones; ${E.name} no garantiza su exactitud, completitud ni adecuación para ningún uso específico.`,
      ],
    },
    {
      heading: "8. Limitación de responsabilidad",
      body: [
        // ADAPTED: the source promises 24 hours of notice before scheduled maintenance; this
        // product has no channel to announce maintenance, so the promise is not made.
        `8.1 Disponibilidad del servicio. ${E.name} se compromete a realizar esfuerzos razonables para mantener la Plataforma disponible de manera continua, pero no garantiza una disponibilidad del 100 %. No será responsable por interrupciones debidas a mantenimiento, fallos de terceros proveedores de infraestructura, causas de fuerza mayor, ni por pérdidas derivadas de dichas interrupciones.`,
        `8.2 Exactitud de contenidos. La información sobre cafés y los contenidos de la Plataforma se proporcionan «tal cual». ${E.name} no garantiza que sean exhaustivos, libres de errores ni actualizados en todo momento.`,
        // OWNER DECISION NEEDED: kept from the source. While access is free, "el importe
        // abonado en los 12 meses anteriores" is zero.
        `8.3 Exclusión de daños indirectos. En la máxima medida permitida por la ley aplicable, ${E.name} no será responsable de daños indirectos, lucro cesante, pérdida de datos o cualquier daño consecuente derivado del uso o imposibilidad de uso de la Plataforma. La responsabilidad máxima total frente a un usuario no superará el importe abonado por éste en los 12 meses anteriores al hecho causante del daño.`,
        `8.4 Cláusulas abusivas (LGDCU arts. 82–90). Las limitaciones de responsabilidad anteriores no se aplican a: (a) muerte o daños personales causados por negligencia de ${E.name}; (b) fraude o dolo del prestador; (c) derechos irrenunciables del consumidor bajo la legislación española. Ninguna cláusula de estos T&C pretende limitar derechos que la ley otorga al consumidor de forma irrenunciable.`,
      ],
    },
    {
      heading: "9. Modificaciones de los términos",
      body: [
        `${E.name} podrá modificar los presentes T&C cuando sea necesario por cambios normativos, nuevas funcionalidades o razones empresariales legítimas.`,
        {
          list: [
            "Se notificará al usuario por correo electrónico o mediante aviso destacado en la Plataforma con al menos 30 días de antelación a la entrada en vigor de los cambios.",
            // ADAPTED: the source says "cancelar su suscripción sin penalización"; there are no subscriptions.
            "El usuario podrá dejar de usar la Plataforma y pedir la supresión de su cuenta antes de la fecha de entrada en vigor si no acepta las modificaciones.",
            "El uso continuado de la Plataforma tras la entrada en vigor implica la aceptación de los nuevos términos.",
            "En ningún caso se modificarán unilateralmente los términos esenciales del contrato en perjuicio del usuario sin su consentimiento expreso (LGDCU art. 85).",
          ],
        },
      ],
    },
    {
      heading: "10. Suspensión y resolución del contrato",
      body: [
        { sub: "10.1 Por parte del usuario" },
        {
          list: [
            // ADAPTED: the source points to an in-app delete button, which is not enabled yet.
            `El usuario puede pedir la supresión de su cuenta en cualquier momento escribiendo a ${SUPPORT_EMAIL}.`,
            "La supresión de la cuenta implica la pérdida del perfil, el historial y demás datos asociados, que serán bloqueados y posteriormente eliminados conforme al art. 32 LOPDGDD. Las evaluaciones hechas en catas compartidas con otras personas, y las catas que organizó y en las que evaluaron otras personas, se conservan sin el nombre del usuario.",
          ],
        },
        { sub: "10.2 Por parte del prestador" },
        {
          list: [
            `${E.name} podrá suspender o cancelar una cuenta, con o sin preaviso, en caso de: incumplimiento grave de estos T&C; conducta fraudulenta o abusiva; o requerimiento legal.`,
            "En caso de suspensión por incumplimiento leve, se notificará al usuario con 7 días de antelación y se le dará la oportunidad de subsanar la situación.",
          ],
        },
      ],
    },
    {
      heading: "11. Protección de datos",
      body: [
        `El tratamiento de datos personales derivado del uso de la Plataforma se rige por nuestra Política de Privacidad, disponible en ${E.site}/privacidad, que forma parte integrante de estos T&C.`,
        `${E.name} trata los datos de conformidad con el RGPD (Reglamento (UE) 2016/679) y la LOPDGDD (Ley Orgánica 3/2018). El responsable del tratamiento es ${E.name}, CIF ${E.cif}, con domicilio en ${E.address}.`,
      ],
    },
    {
      heading: "12. Ley aplicable y resolución de conflictos",
      body: [
        "Los presentes T&C se rigen por la legislación española y de la Unión Europea. Son de aplicación especial:",
        {
          list: [
            "Real Decreto Legislativo 1/2007 (LGDCU) — protección de consumidores y usuarios.",
            "Ley 34/2002 (LSSI-CE) — servicios de la sociedad de la información.",
            "Reglamento (UE) 2022/2065 (DSA) — servicios digitales.",
            "Reglamento (UE) 2024/1689 — Reglamento de Inteligencia Artificial.",
            "Reglamento (UE) 2016/679 (RGPD) y Ley Orgánica 3/2018 (LOPDGDD).",
          ],
        },
        "Para cualquier controversia que no pueda resolverse amistosamente, las partes se someten a la jurisdicción de los Juzgados y Tribunales de Madrid. No obstante, si el usuario tiene la condición de consumidor, podrá acudir a los tribunales de su lugar de residencia o a los mecanismos de resolución alternativa de litigios: las Juntas Arbitrales de Consumo de su municipio o comunidad autónoma, las Oficinas Municipales de Información al Consumidor (OMIC) y AECOSAN (Agencia Española de Consumo, Seguridad Alimentaria y Nutrición).",
        `${E.name} | CIF: ${E.cif} | ${E.address} | ${SUPPORT_EMAIL} | ${E.site}`,
      ],
    },
  ],
};
