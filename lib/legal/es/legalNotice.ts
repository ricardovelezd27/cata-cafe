// Aviso legal (es). SOURCE: the owner's "Aviso Legal" v1.0 (April 2026),
// written for another product of the same company.
// ADAPTATION RULES (owner's decision, 2026-11-12): keep the identification
// data, intellectual property, conditions of use, liability, law and
// jurisdiction; change product name and domain; remove ONLY what describes
// features Café Sensible does not have (marketplace, AI scanner, paid plans,
// separate cookie policy and accessibility statement pages).
// Paragraphs marked ADDED are not in the source and need the owner's eye.
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import { LEGAL_ENTITY, LEGAL_TEXT_VERSION } from "../company";
import type { LegalDoc } from "../types";

const E = LEGAL_ENTITY;

export const LEGAL_NOTICE_ES: LegalDoc = {
  title: "Aviso legal",
  version: LEGAL_TEXT_VERSION.es,
  intro: [
    `En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se pone a disposición de los usuarios la siguiente información legal sobre el titular del sitio web y la aplicación ${E.product}.`,
  ],
  sections: [
    {
      heading: "1. Datos identificativos del titular",
      body: [
        "De conformidad con el artículo 10.1 LSSI-CE, los datos del titular del presente sitio web y aplicación son:",
        {
          rows: [
            ["Denominación social", E.name],
            ["CIF", E.cif],
            ["Domicilio social", E.address],
            ...(E.registry ? ([["Registro Mercantil", E.registry]] as [string, string][]) : []),
            ["Email de contacto", SUPPORT_EMAIL],
            ["Sitio web / App", `${E.site} | ${E.product}`],
            // ADAPTED: the source describes a catalogue, scanner and marketplace.
            ["Actividad", "Plataforma digital de cata de café: sesiones de cata, evaluación sensorial e informes"],
            ["Código CNAE", E.cnae],
          ],
        },
      ],
    },
    {
      heading: "2. Objeto y ámbito de aplicación",
      body: [
        `El presente Aviso Legal regula el acceso y uso del sitio web accesible en ${E.site} y de la aplicación ${E.product} (en adelante, conjuntamente, «la Plataforma»), titularidad de ${E.name}.`,
        "El acceso a la Plataforma implica la aceptación plena y sin reservas del presente Aviso Legal, así como de los Términos y Condiciones y de la Política de Privacidad, que forman parte integrante del marco legal aplicable a los usuarios.",
        "La Plataforma está dirigida a mayores de 14 años. Los menores de 14 años requieren el consentimiento expreso de sus tutores legales para registrarse y usar el servicio.",
      ],
    },
    {
      heading: "3. Propiedad intelectual e industrial",
      body: [
        `Todos los contenidos de la Plataforma — incluyendo, sin carácter limitativo, textos, imágenes, logotipos, iconos, código fuente, diseño gráfico, ejercicios y datos de referencia — son propiedad exclusiva de ${E.name} o de terceros que han autorizado su uso, y están protegidos por la normativa española e internacional sobre propiedad intelectual e industrial.`,
        "3.1 Está expresamente prohibido:",
        {
          list: [
            "Reproducir, distribuir, comunicar públicamente o transformar total o parcialmente cualquier contenido de la Plataforma sin autorización escrita previa del titular.",
            "Utilizar los contenidos con fines comerciales sin licencia expresa.",
            "Realizar ingeniería inversa, descompilar o desensamblar el código fuente de la aplicación.",
            "Eliminar, alterar u ocultar cualquier aviso de derechos de autor, marca registrada u otro aviso de propiedad.",
            "Usar robots, scrapers u otras herramientas automáticas para extraer contenidos o datos de la Plataforma.",
          ],
        },
        `3.2 Marcas y nombres comerciales. El nombre «${E.product}», el logotipo asociado y cualquier otra denominación comercial o signo distintivo que aparezca en la Plataforma son signos distintivos de ${E.name} o de terceros que han autorizado su uso. Su uso no autorizado constituye una infracción de la normativa aplicable.`,
        `3.3 Contenido generado por el usuario. Los usuarios que introduzcan evaluaciones, notas de cata, fichas de café u otro contenido en la Plataforma conservan sus derechos de autor sobre dicho contenido, pero otorgan a ${E.name} una licencia no exclusiva, mundial, gratuita y transferible para usar, reproducir, mostrar y distribuir ese contenido en el marco del funcionamiento de la Plataforma.`,
      ],
    },
    {
      heading: "4. Condiciones generales de uso",
      body: [
        // ADAPTED: there are no passwords here.
        "4.1 Acceso y registro. El registro de cuenta es necesario para crear catas, cafés y grupos. Al registrarse, el usuario garantiza que la información facilitada es veraz, completa y actualizada, y es responsable de mantener el control de su correo electrónico y de sus enlaces de acceso.",
        "4.2 Usos prohibidos. El usuario se compromete a no utilizar la Plataforma para:",
        {
          list: [
            "Actividades ilegales, fraudulentas o contrarias a la buena fe y al orden público.",
            "Difundir contenidos que sean difamatorios, obscenos, discriminatorios, o que vulneren derechos de terceros.",
            "Suplantar la identidad de otras personas o entidades.",
            "Distribuir virus informáticos, malware u otros elementos que puedan dañar sistemas o datos.",
            "Realizar actividades de spam, phishing o recopilación masiva de datos sin consentimiento.",
            "Interferir con el funcionamiento normal de la Plataforma o de sus sistemas de seguridad.",
            "Acceder a áreas restringidas o cuentas de otros usuarios sin autorización.",
            "Utilizar la Plataforma para actividades que infrinjan la normativa vigente en materia de protección de datos, propiedad intelectual o competencia desleal.",
          ],
        },
        `4.3 Suspensión y cancelación de cuentas. ${E.name} se reserva el derecho a suspender, desactivar o eliminar, con o sin previo aviso, el acceso de cualquier usuario que incumpla el presente Aviso Legal, los Términos y Condiciones o la legislación aplicable. En casos graves o de reincidencia, podrá adoptarse la medida de forma inmediata sin necesidad de notificación previa.`,
      ],
    },
    {
      heading: "5. Limitación de responsabilidad",
      body: [
        `5.1 Disponibilidad del servicio. ${E.name} realiza esfuerzos razonables para mantener la Plataforma disponible de forma continua, pero no garantiza la ausencia de interrupciones, errores o fallos técnicos. El titular no será responsable por daños derivados de la falta de disponibilidad, errores de transmisión o pérdida de datos por causas ajenas a su control.`,
        // ADAPTED: the source's clause is about an AI packaging scanner.
        `5.2 Exactitud del contenido e IA. Los textos generados con inteligencia artificial en el área de análisis son orientativos y pueden contener imprecisiones. ${E.name} no garantiza la exactitud, completitud o idoneidad de la información proporcionada por sistemas de IA.`,
        `5.3 Contenidos y enlaces de terceros. La Plataforma puede incluir contenidos o enlaces a sitios web de terceros. ${E.name} no tiene control sobre dichos sitios y no asume ninguna responsabilidad por sus contenidos, políticas de privacidad o prácticas. La inclusión de un enlace no implica respaldo ni relación comercial con el titular de dicho sitio.`,
        `5.4 Responsabilidad del usuario. El usuario es responsable del uso que haga de la Plataforma y de los contenidos que introduzca. ${E.name} no se hace responsable de los daños que puedan derivarse del uso indebido de la Plataforma por parte del usuario o de terceros.`,
      ],
    },
    {
      // ADAPTED: the source describes subscription prices with VAT. There are none today.
      heading: "6. Información sobre precios",
      body: [
        "En cumplimiento del artículo 10.1(f) LSSI-CE: actualmente el acceso a la Plataforma es gratuito. Si en el futuro se ofrecen servicios de pago, los precios se mostrarán en euros (EUR) con el Impuesto sobre el Valor Añadido (IVA) aplicable incluido, antes de cualquier contratación.",
      ],
    },
    {
      heading: "7. Protección de datos y cookies",
      body: [
        `${E.name} trata los datos personales de los usuarios de conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD). Para información completa sobre cómo recogemos, usamos y protegemos sus datos, consulte nuestra Política de Privacidad, disponible en ${E.site}/privacidad.`,
        // ADAPTED: the source points to a separate cookie policy; here it is section 9 of the privacy policy.
        "La Plataforma solo utiliza cookies estrictamente necesarias para su funcionamiento. El detalle está en la sección 9 de la Política de Privacidad.",
      ],
    },
    {
      heading: "8. Legislación aplicable y jurisdicción",
      body: [
        "8.1 Marco legal. El presente Aviso Legal se rige por la legislación española y europea, en particular:",
        {
          list: [
            "Ley 34/2002, de 11 de julio, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE).",
            "Real Decreto Legislativo 1/2007, de 16 de noviembre (LGDCU) — protección de consumidores y usuarios.",
            "Reglamento (UE) 2016/679 (RGPD) y Ley Orgánica 3/2018 (LOPDGDD) — protección de datos.",
            "Reglamento (UE) 2022/2065 (Ley de Servicios Digitales / DSA) — servicios digitales.",
            "Reglamento (UE) 2024/1689 (Reglamento de Inteligencia Artificial) — sistemas de IA.",
            "Ley 11/2023, de 8 de mayo — accesibilidad de productos y servicios digitales.",
          ],
        },
        "8.2 Jurisdicción. Para la resolución de cualquier conflicto derivado del acceso o uso de la Plataforma, las partes se someten, con renuncia expresa a cualquier otro fuero que pudiera corresponderles, a la jurisdicción de los Juzgados y Tribunales de la ciudad de Madrid.",
        "Sin perjuicio de lo anterior, si el usuario tiene la condición de consumidor conforme a la LGDCU, será de aplicación la normativa de protección al consumidor, que puede otorgar competencia a los tribunales del lugar de residencia del consumidor o a los mecanismos alternativos de resolución de conflictos (Juntas Arbitrales de Consumo, OMIC).",
      ],
    },
    {
      // ADAPTED: the source links to a full accessibility statement, which does
      // not exist for this app yet (parked by the owner until an audit is done).
      heading: "9. Accesibilidad",
      body: [
        `${E.name} está comprometida con la accesibilidad digital de conformidad con la Ley 11/2023 (transposición de la Directiva Europea de Accesibilidad, Directiva 2019/882/UE). La Plataforma aspira a conformarse con el estándar EN 301 549 v3.2.1, que incorpora las Directrices de Accesibilidad para el Contenido Web (WCAG) 2.1 en su nivel AA.`,
        `Si encuentra barreras de accesibilidad en la Plataforma, puede comunicárnoslo a través de ${SUPPORT_EMAIL}. Atenderemos su solicitud en el plazo de 15 días hábiles.`,
      ],
    },
    {
      heading: "10. Modificaciones del aviso legal",
      body: [
        `${E.name} se reserva el derecho de modificar el presente Aviso Legal en cualquier momento para adaptarlo a cambios legislativos, jurisprudenciales o empresariales. Las modificaciones entrarán en vigor en el momento de su publicación en la Plataforma.`,
        "Se recomienda a los usuarios revisar periódicamente este Aviso Legal. El acceso continuado a la Plataforma con posterioridad a cualquier modificación implica la aceptación de los cambios introducidos.",
        `${E.name} | CIF: ${E.cif} | ${E.address} | ${SUPPORT_EMAIL} | ${E.site}`,
      ],
    },
  ],
};
