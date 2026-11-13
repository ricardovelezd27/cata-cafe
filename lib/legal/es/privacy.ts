// Política de privacidad (es). SOURCE: the owner's "Política de Privacidad"
// v1.0 (April 2026), written for another product of the same company.
// ADAPTATION RULES (owner's decision, 2026-11-12): keep the company facts,
// legal bases, rights, AEPD route, minors, security duties and jurisdiction;
// change product name and domain; remove ONLY what describes features Café
// Sensible does not have (passwords, payments, AI scanner, analytics and
// advertising cookies, cookie banner); state only what the code does.
// Paragraphs marked ADDED are not in the source and need the owner's eye.
// The contact address is the app's support address (lib/siteContact.ts), not
// the personal address and phone printed in the source documents.
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import { LEGAL_ENTITY, LEGAL_TEXT_VERSION } from "../company";
import { WAITLIST_RETENTION_MONTHS } from "../config";
import type { LegalDoc } from "../types";

const E = LEGAL_ENTITY;

export const PRIVACY_ES: LegalDoc = {
  title: "Política de privacidad",
  version: LEGAL_TEXT_VERSION.es,
  intro: [
    `${E.product} (${E.site}) es una plataforma de cata de café operada por ${E.name}. Esta política explica qué datos personales tratamos, para qué, con qué base legal y qué derechos tiene usted.`,
    "Marco legal: Reglamento (UE) 2016/679 (RGPD) y Ley Orgánica 3/2018 (LOPDGDD). Jurisdicción: España / Unión Europea.",
  ],
  sections: [
    {
      heading: "1. Responsable del tratamiento de datos",
      body: [
        "De conformidad con el artículo 13 del RGPD y el artículo 11 de la LOPDGDD, le informamos de que el responsable del tratamiento de sus datos personales es:",
        {
          rows: [
            ["Denominación social", E.name],
            ["CIF", E.cif],
            ["Domicilio social", E.address],
            ...(E.registry ? ([["Registro Mercantil", E.registry]] as [string, string][]) : []),
            ["Email de contacto", SUPPORT_EMAIL],
            ["Sitio web / App", `${E.site} | ${E.product}`],
            [
              "Delegado de Protección de Datos (DPD)",
              "No designado (no preceptivo en virtud del art. 37 RGPD y art. 34 LOPDGDD para el volumen actual de tratamiento). Se revisará esta decisión conforme crezca la base de usuarios.",
            ],
          ],
        },
      ],
    },
    {
      heading: "2. Datos personales que tratamos",
      body: [
        "Recogemos únicamente los datos necesarios para prestar el servicio.",
        { sub: "2.1 Datos que usted nos facilita directamente" },
        {
          list: [
            // ADAPTED: the default name is the first part of the address until the person changes it.
            "Datos identificativos: el nombre con el que se muestra. Por defecto es la primera parte de su correo; puede cambiarlo en su perfil.",
            "Datos de contacto: su dirección de correo electrónico, cuando crea una cuenta, reserva una plaza fundadora o pide un enlace de acceso.",
            "Datos de perfil: rol, país, idioma preferido y, si la añade, una biografía breve.",
            "Contenido generado: sesiones de cata, evaluaciones, puntajes, descriptores, notas, cafés que registra (incluidos datos de origen como finca o productor) y grupos de cata.",
            // ADDED: guests exist only in this app.
            "Si participa como invitado en una cata sin crear cuenta: el nombre que escribe y un identificador anónimo ligado a su navegador.",
            // ADDED: group owners enter other people's addresses.
            "Si el organizador de un grupo de cata añade su dirección de correo para invitarle: esa dirección y, si la indica, su nombre.",
            "Comunicaciones: los mensajes que nos envía por correo.",
          ],
        },
        // ADAPTED: the source lists a hashed password; this app has no passwords.
        "No usamos contraseñas: el acceso se hace con un enlace o un código enviado a su correo, o con su cuenta de Google si elige esa opción. En ese caso Google nos comunica su dirección de correo, su nombre, su imagen de perfil y el identificador de su cuenta de Google.",
        // ADAPTED: the source describes Stripe payments; this app takes no payments.
        "No tratamos datos de pago: actualmente la plataforma no cobra por ningún servicio.",
        { sub: "2.2 Datos recogidos automáticamente" },
        {
          list: [
            // ADAPTED: the app's own logs are designed to carry ids and codes only.
            "Datos técnicos de la aplicación: registros de funcionamiento y de errores (nombre de la acción, código de error e identificadores internos). No registramos deliberadamente el contenido de sus evaluaciones ni su correo.",
            "Datos de dispositivo y de conexión: nuestros proveedores de alojamiento y de autenticación registran datos técnicos de cada petición (dirección IP, tipo de navegador y de dispositivo, ruta solicitada y marcas de tiempo).",
            // ADDED: the email rate limit ledger (keyed hash of IP / address).
            "Para limitar el abuso del envío de correos de acceso usamos su dirección IP y la dirección de destino de forma transitoria, y solo guardamos una huella con clave de ambas, que no permite recuperar el dato original.",
            "Almacenamiento en su dispositivo: borradores de sus evaluaciones para poder catar sin conexión, una copia de los datos de sus catas, preferencias de la interfaz y copias de páginas ya visitadas (véase la sección 9).",
          ],
        },
        { sub: "2.3 Datos NO recogidos" },
        {
          list: [
            // ADDED: the second sentence (free-text fields exist in this app).
            "No pedimos datos de categorías especiales (salud, origen racial, creencias, etc.). Le pedimos que no los incluya en notas ni en campos de texto libre.",
            // ADAPTED: the source says microphone, camera and contacts; location added (blocked by the app's headers).
            "No accedemos al micrófono, la cámara, la ubicación ni los contactos del dispositivo.",
            "No vendemos ni cedemos datos a terceros con fines publicitarios.",
            // ADDED: verified in the code (no analytics, pixel or tag manager).
            "No usamos cookies de analítica ni de publicidad, ni herramientas de seguimiento de terceros.",
          ],
        },
      ],
    },
    {
      heading: "3. Finalidades del tratamiento y bases legales",
      body: [
        "Cada tratamiento se basa en una de las bases legales del artículo 6 del RGPD:",
        {
          list: [
            "Gestión de cuenta y autenticación — art. 6(1)(b), ejecución del contrato. No admite oposición (es esencial).",
            "Prestación del servicio (sesiones de cata, resultados, informes en PDF, cafés y grupos) — art. 6(1)(b), ejecución del contrato.",
            // ADDED: the waitlist / founding seats, with the proposed retention.
            `Reserva de plaza fundadora — art. 6(1)(b), medidas precontractuales a petición suya: guardamos su correo para enviarle el acceso y avisarle sobre las plazas fundadoras. Si no llega a crear una cuenta, lo conservamos como máximo ${WAITLIST_RETENTION_MONTHS} meses.`,
            "Comunicaciones de servicio (enlaces de acceso, resultados de una cata en la que participó, recordatorios de cierre) — art. 6(1)(b), ejecución del contrato.",
            // ADDED: group mail to addresses supplied by a group owner.
            "Avisos de un grupo de cata a las direcciones que añadió su organizador — art. 6(1)(f), interés legítimo en que el grupo pueda organizarse. Cada correo incluye un enlace para dejar de recibirlos.",
            "Seguridad, prevención del abuso y registros técnicos — art. 6(1)(f), interés legítimo.",
            "Estadísticas internas de uso, elaboradas con datos agregados de la propia base de datos y sin cookies — art. 6(1)(f), interés legítimo. Puede oponerse escribiéndonos.",
            "Marketing y boletines — art. 6(1)(a), consentimiento. Actualmente no enviamos comunicaciones comerciales (véase la sección 11).",
            "Cumplimiento de obligaciones legales — art. 6(1)(c).",
          ],
        },
        `Nota sobre el interés legítimo: cuando basamos un tratamiento en el art. 6(1)(f), hemos realizado el test de ponderación correspondiente y hemos concluido que nuestros intereses no prevalecen sobre sus derechos y libertades fundamentales. Puede solicitar información sobre dicho test escribiéndonos a ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: "4. Destinatarios y encargados del tratamiento",
      body: [
        "Sus datos pueden ser comunicados a los siguientes proveedores de servicios, que actúan como encargados del tratamiento (art. 28 RGPD):",
        {
          rows: [
            // ADAPTED: the project's region is Central EU (Frankfurt), checked in the Supabase dashboard on 2026-11-13.
            ["Supabase Inc.", "Base de datos, autenticación, envío de los correos de acceso y sincronización en tiempo real. Los datos se alojan en la Unión Europea (Fráncfort). Empresa de EE. UU. — cláusulas contractuales tipo y acuerdo de encargo firmado. supabase.com/privacy"],
            // ADAPTED: the source lists Stripe and Lovable Cloud; this app uses Vercel and Resend.
            ["Vercel Inc.", "Alojamiento de la aplicación y registros técnicos. EE. UU. — con las garantías del Capítulo V del RGPD. vercel.com/legal/privacy-policy"],
            ["Resend (Plus Five Five, Inc.)", "Envío de correos de servicio (resultados, invitaciones, recordatorios). EE. UU. — con las garantías del Capítulo V del RGPD. resend.com/legal/privacy-policy"],
            ["Google LLC", "Inicio de sesión con Google, si usted lo elige, y modelo de inteligencia artificial Gemini (véase la sección 8). EE. UU. — Marco de Privacidad de Datos UE-EE. UU. policies.google.com/privacy"],
          ],
        },
        "No comunicamos sus datos a terceros con fines propios sin su consentimiento explícito. No realizamos transferencias internacionales fuera de las anteriores, todas con garantías adecuadas conforme al Capítulo V del RGPD.",
        // ADDED: what other users of a shared cupping can see.
        "Dentro de la plataforma, el organizador de una cata ve el nombre y las evaluaciones de quienes participan en ella, y los miembros de un grupo de cata ven los nombres de los demás miembros. Quienes han catado con usted en una cata de grupo ven, en la sección Grupos, su nombre, su rol, cuántas catas han compartido con usted y cuántas evaluaciones hizo usted en ellas, y la fecha y el nombre de la última cata que compartieron. Los cafés que su creador hace públicos o comparte son visibles para otras personas. Los administradores de la plataforma pueden acceder a los datos para dar soporte y elaborar estadísticas.",
      ],
    },
    {
      heading: "5. Menores de edad",
      body: [
        "De conformidad con el artículo 7 de la LOPDGDD, la edad mínima para consentir el tratamiento de datos en España es de 14 años. Los menores de 14 años requieren el consentimiento del titular de la patria potestad o tutela. Nota: la PLOPMED (aprobada en marzo de 2025, pendiente de aprobación parlamentaria) elevará este límite a 16 años para servicios digitales; esta política se actualizará cuando entre en vigor.",
        // OWNER DECISION NEEDED: kept from the source. There is no age check in the
        // product, and "eliminar la cuenta de forma inmediata" needs account deletion
        // enabled (ACCOUNT_DELETION_ENABLED is off until the runbook §24 rehearsal).
        `${E.product} no está dirigida a menores de 14 años. Si usted es padre, madre o tutor y sospecha que su hijo/a menor de 14 años ha creado una cuenta, le rogamos que nos lo comunique a ${SUPPORT_EMAIL}. Procederemos a eliminar la cuenta y los datos asociados de forma inmediata.`,
      ],
    },
    {
      heading: "6. Sus derechos",
      body: [
        "De conformidad con los artículos 15 a 22 del RGPD y los artículos 13 a 18 de la LOPDGDD, usted tiene los siguientes derechos respecto a sus datos personales:",
        {
          list: [
            "Acceso: obtener copia de los datos que tratamos sobre usted (art. 15 RGPD / art. 13 LOPDGDD).",
            "Rectificación: corregir datos inexactos o incompletos (art. 16 RGPD / art. 14 LOPDGDD).",
            "Supresión: solicitar la eliminación de sus datos cuando, entre otros motivos, ya no sean necesarios. Los datos se «bloquearán» antes de su eliminación definitiva conforme al art. 32 LOPDGDD (art. 17 RGPD / art. 15 LOPDGDD).",
            "Limitación del tratamiento: suspender el tratamiento en determinadas circunstancias (art. 18 RGPD / art. 16 LOPDGDD).",
            "Portabilidad: recibir sus datos en formato estructurado y legible por máquina (art. 20 RGPD / art. 17 LOPDGDD).",
            "Oposición: oponerse al tratamiento basado en interés legítimo (art. 21 RGPD / art. 18 LOPDGDD).",
            "No ser objeto de decisiones automatizadas con efectos significativos (art. 22 RGPD).",
            "Retirada del consentimiento en cualquier momento, sin afectar a la licitud del tratamiento previo (art. 7(3) RGPD).",
          ],
        },
        { sub: "Cómo ejercer sus derechos" },
        {
          list: [
            `Envíe un correo electrónico a ${SUPPORT_EMAIL} con el asunto «Ejercicio de derechos RGPD».`,
            "Indique el derecho que desea ejercer, adjunte copia de su DNI/NIE u otro documento de identidad válido y proporcione los detalles de su solicitud.",
            "Responderemos en el plazo de un mes (art. 12.3 RGPD). En casos complejos, el plazo puede prorrogarse hasta tres meses, notificándoselo en el primer mes.",
            "Si considera que no hemos atendido correctamente su solicitud, puede presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD): www.aepd.es — Calle Jorge Juan 6, 28001, Madrid.",
          ],
        },
      ],
    },
    {
      heading: "7. Seguridad de los datos",
      body: [
        "Aplicamos medidas técnicas y organizativas adecuadas conforme al artículo 32 del RGPD para proteger sus datos frente a accesos no autorizados, pérdida accidental, destrucción o alteración:",
        {
          list: [
            "Cifrado en tránsito mediante TLS en todas las comunicaciones.",
            // ADAPTED: the source describes password hashing; this app has no passwords.
            "Acceso sin contraseñas: enlaces y códigos de un solo uso enviados a su correo.",
            "Comprobación de permisos en el servidor en cada operación y seguridad a nivel de fila en la base de datos: cada persona accede a sus propios datos, a las catas en las que participa y a lo que otras personas han compartido con ella o han hecho público.",
            "Control de acceso basado en funciones (organizador de la cata, participante, administrador).",
            "Limitación de envíos para prevenir abusos de los correos de acceso.",
            // ADAPTED: the source also commits to regular key rotation and periodic
            // security audits; neither is a process this product can show today.
            "Las claves de servicio se usan solo en el servidor, con los mínimos privilegios necesarios.",
          ],
        },
        "Notificación de brechas de seguridad: en caso de brecha de seguridad que pueda entrañar un riesgo para sus derechos y libertades, notificaremos a la AEPD en el plazo máximo de 72 horas desde su conocimiento (art. 33 RGPD). Si es probable que la brecha genere un alto riesgo para usted, se lo comunicaremos directamente sin demora indebida (art. 34 RGPD).",
      ],
    },
    {
      // ADAPTED: the source section is about an AI packaging scanner, which this app does not have.
      heading: "8. Inteligencia artificial",
      body: [
        "Aviso de transparencia (art. 50 del Reglamento (UE) 2024/1689): algunas funciones del área de análisis generan textos con inteligencia artificial. Esos textos pueden contener imprecisiones.",
        {
          list: [
            `${E.name} actúa como «responsable del despliegue» a los efectos del Reglamento de IA de la UE; Google LLC actúa como «proveedor» del modelo Gemini.`,
            "Para redactar los resúmenes del área de análisis se envían al modelo cifras y etiquetas agregadas (promedios, recuentos, nombres de orígenes o de procesos). Cuando quien consulta desglosa sus propias catas por catador, las etiquetas incluyen los nombres de esos catadores. No se envían evaluaciones individuales, notas ni direcciones de correo.",
            "El asistente de análisis, reservado a administradores de la plataforma, envía además la pregunta que escribe el administrador, nombres de sesiones de cata y nombres de los cafés catados.",
            "No se toman decisiones automatizadas sobre usted con estos sistemas.",
          ],
        },
      ],
    },
    {
      // ADAPTED: replaces the source's cookie section and its separate cookie
      // policy (banner, analytics and advertising cookies), none of which exist here.
      heading: "9. Cookies y almacenamiento en su dispositivo",
      body: [
        "Usamos cookies de conformidad con el artículo 22.2 de la LSSI. Solo usamos cookies estrictamente necesarias, que no requieren consentimiento; por eso no mostramos un panel de consentimiento de cookies:",
        {
          rows: [
            ["Sesión de usuario (cookies de Supabase, nombre «sb-…-auth-token»)", "Mantienen su sesión iniciada. Se renuevan mientras usa la aplicación y caducan como máximo a los 400 días."],
            ["Inicio de sesión (cookie de Supabase, nombre «sb-…-auth-token-code-verifier»)", "Protege el inicio de sesión. Se crea cuando usted pide un enlace o un código de acceso, reserva una plaza, cambia su correo o empieza a entrar con Google. Se elimina cuando el inicio de sesión se completa en este mismo navegador; si no se completa aquí, caduca como máximo a los 400 días."],
            ["cata_signin_intent", "Protege el inicio de sesión: recuerda, mediante una huella con clave, que el enlace de acceso se pidió desde este navegador. 1 hora."],
            ["cata_signin_pending", "Protege el inicio de sesión cuando el enlace se abre en otro navegador, hasta que usted confirma quién es. 10 minutos."],
          ],
        },
        "No usamos cookies de analítica, de publicidad ni de terceros con fines de seguimiento.",
        "Además, la aplicación guarda en su dispositivo (almacenamiento local del navegador) lo necesario para funcionar: los borradores de sus evaluaciones, para que pueda catar sin conexión y no pierda trabajo; una copia de los datos de sus catas; sus preferencias de la interfaz; y copias de páginas ya visitadas. Al cerrar sesión se borran las copias de páginas. Los borradores y la copia de los datos de sus catas permanecen en el dispositivo hasta que usted los descarta o borra los datos del navegador.",
        "Puede eliminar las cookies y el almacenamiento desde la configuración de su navegador. Si lo hace, deberá volver a iniciar sesión y perderá los borradores que no se hayan sincronizado. En un dispositivo compartido, borre los datos del navegador al terminar.",
      ],
    },
    {
      heading: "10. Plazos de conservación y bloqueo",
      body: [
        "Los datos personales se conservarán durante el tiempo necesario para la finalidad para la que fueron recogidos, respetando en todo momento los plazos mínimos legales de conservación.",
        {
          list: [
            // ADAPTED: the source adds tax retention periods tied to payments, which do not exist here.
            "Datos de cuenta y contenido: mientras exista la cuenta.",
            // ADDED: what account deletion really does in this app.
            "Al suprimir la cuenta se eliminan el perfil, el historial y los datos de acceso. Las evaluaciones que hizo en catas compartidas con otras personas se conservan sin su nombre, para que los resultados de los demás no cambien; las catas que organizó y en las que evaluaron otras personas se conservan cerradas y sin su nombre; y los cafés que creó se conservan sin sus datos identificativos (nombre, finca, productor, notas).",
            `Reserva de plaza fundadora sin cuenta: como máximo ${WAITLIST_RETENTION_MONTHS} meses. Si creó una cuenta, la reserva se conserva mientras exista la cuenta y se elimina al suprimirla.`,
            // ADDED: addresses a group organiser enters for other people.
            "Direcciones añadidas a un grupo de cata por su organizador: mientras exista el grupo o hasta que el organizador las retire.",
            "Huellas usadas para limitar los envíos de correo: se eliminan automáticamente cuando dejan de ser necesarias.",
            // ADAPTED: the source says 12 months; the retention of provider logs is set by the providers.
            "Registros técnicos: durante un periodo limitado, por seguridad.",
            "Registros de brechas de seguridad: 3 años (responsabilidad proactiva, art. 5(2) RGPD).",
          ],
        },
        // OWNER DECISION NEEDED: kept from the source. Today account deletion erases
        // or anonymises in one step (lib/accountDeletion); no code "blocks" data first.
        "Obligación de bloqueo (art. 32 LOPDGDD): la normativa española exige que, con carácter previo a la eliminación definitiva de sus datos, estos sean «bloqueados», es decir, inaccesibles para el tratamiento ordinario pero conservados a disposición de tribunales, fiscalía o autoridades públicas competentes. Una vez transcurrido el plazo legal de prescripción, los datos se eliminarán de forma segura e irreversible.",
      ],
    },
    {
      heading: "11. Comunicaciones comerciales",
      body: [
        "De conformidad con el artículo 21 de la LSSI y el artículo 6(1)(a) del RGPD, únicamente le enviaremos comunicaciones comerciales, boletines o notificaciones de marketing si usted ha prestado su consentimiento expreso e inequívoco.",
        {
          list: [
            // ADAPTED: states the present situation.
            "Actualmente no enviamos comunicaciones comerciales.",
            "El consentimiento para recibir marketing es siempre opcional y no condiciona la prestación del servicio.",
            `Puede revocar su consentimiento en cualquier momento escribiendo a ${SUPPORT_EMAIL}.`,
            "Jamás enviaremos correos electrónicos solicitando permiso para enviar marketing: dicho correo constituiría en sí mismo una comunicación no solicitada e infringiría el art. 21 LSSI.",
            "Las comunicaciones de servicio (enlaces de acceso, resultados de una cata, avisos de cierre, alertas de seguridad) no son comunicaciones comerciales y se envían con base en el contrato.",
          ],
        },
      ],
    },
    {
      heading: "12. Modificaciones de esta política",
      body: [
        "Nos reservamos el derecho a actualizar esta Política de Privacidad cuando sea necesario, por ejemplo ante cambios normativos, nuevas funcionalidades del servicio o modificaciones en nuestros proveedores. En caso de cambios sustanciales:",
        {
          list: [
            "Le notificaremos por correo electrónico o mediante un aviso destacado en la aplicación con al menos 30 días de antelación.",
            "La versión y la fecha de la última actualización se indican siempre en el encabezado del documento.",
            "Si no está de acuerdo con los cambios, podrá pedir la supresión de su cuenta antes de su entrada en vigor.",
            "El uso continuado del servicio tras la entrada en vigor de los cambios implica la aceptación de la nueva versión de la política.",
          ],
        },
      ],
    },
    {
      heading: "13. Legislación aplicable y jurisdicción",
      body: [
        "Esta Política de Privacidad se rige por la normativa española y de la Unión Europea, en particular:",
        {
          list: [
            "Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo, de 27 de abril de 2016 (RGPD).",
            "Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD).",
            "Ley 34/2002, de 11 de julio, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE).",
            "Reglamento (UE) 2024/1689 del Parlamento Europeo y del Consejo (Reglamento de Inteligencia Artificial).",
          ],
        },
        "Para cualquier controversia derivada de la interpretación o aplicación de esta política, las partes se someten a la jurisdicción de los Juzgados y Tribunales de Madrid, sin perjuicio del derecho del usuario a acudir a la AEPD (www.aepd.es) o a los mecanismos de resolución alternativa de litigios disponibles.",
        `${E.name} | CIF: ${E.cif} | ${E.address} | ${SUPPORT_EMAIL} | ${E.site}`,
      ],
    },
  ],
};
