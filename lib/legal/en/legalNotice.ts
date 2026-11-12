// Legal notice (en). Faithful translation of lib/legal/es/legalNotice.ts,
// block for block. The Spanish original prevails; see the first intro paragraph.
// Paragraphs marked ADDED / ADAPTED mirror the same paragraphs in the Spanish
// file (they are not in the owner's source document and need the owner's eye).
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import { LEGAL_ENTITY, LEGAL_TEXT_VERSION } from "../company";
import type { LegalDoc } from "../types";

const E = LEGAL_ENTITY;

export const LEGAL_NOTICE_EN: LegalDoc = {
  title: "Legal notice",
  version: LEGAL_TEXT_VERSION.en,
  intro: [
    "This is a translation of the Spanish original. In case of discrepancy, the Spanish version prevails.",
    `In compliance with Article 10 of Law 34/2002 of 11 July on Information Society Services and Electronic Commerce (LSSI-CE), the following legal information about the owner of the website and of the ${E.product} application is made available to users.`,
  ],
  sections: [
    {
      heading: "1. Identification data of the owner",
      body: [
        "In accordance with Article 10.1 LSSI-CE, the details of the owner of this website and application are:",
        {
          rows: [
            ["Company name", E.name],
            ["Tax ID (CIF)", E.cif],
            ["Registered office", E.address],
            ...(E.registry ? ([["Commercial Registry", E.registry]] as [string, string][]) : []),
            ["Contact email", SUPPORT_EMAIL],
            ["Website / App", `${E.site} | ${E.product}`],
            // ADAPTED: the source describes a catalogue, scanner and marketplace.
            ["Activity", "Digital coffee cupping platform: cupping sessions, sensory evaluation and reports"],
            ["CNAE code", E.cnae],
          ],
        },
      ],
    },
    {
      heading: "2. Purpose and scope",
      body: [
        `This Legal Notice governs access to and use of the website available at ${E.site} and of the ${E.product} application (hereinafter, jointly, «the Platform»), owned by ${E.name}.`,
        "Access to the Platform implies full and unreserved acceptance of this Legal Notice, as well as of the Terms and Conditions and the Privacy Policy, which form an integral part of the legal framework applicable to users.",
        "The Platform is aimed at persons over 14 years of age. Persons under 14 require the express consent of their legal guardians to register and use the service.",
      ],
    },
    {
      heading: "3. Intellectual and industrial property",
      body: [
        `All content of the Platform — including, without limitation, texts, images, logos, icons, source code, graphic design, exercises and reference data — is the exclusive property of ${E.name} or of third parties who have authorized its use, and is protected by Spanish and international intellectual and industrial property regulations.`,
        "3.1 The following is expressly prohibited:",
        {
          list: [
            "Reproducing, distributing, publicly communicating or transforming, in whole or in part, any content of the Platform without the prior written authorization of the owner.",
            "Using the content for commercial purposes without an express licence.",
            "Reverse engineering, decompiling or disassembling the source code of the application.",
            "Removing, altering or hiding any copyright, trademark or other proprietary notice.",
            "Using robots, scrapers or other automatic tools to extract content or data from the Platform.",
          ],
        },
        `3.2 Trademarks and trade names. The name «${E.product}», the associated logo and any other trade name or distinctive sign appearing on the Platform are distinctive signs of ${E.name} or of third parties who have authorized their use. Their unauthorized use constitutes an infringement of the applicable regulations.`,
        `3.3 User-generated content. Users who enter evaluations, cupping notes, coffee records or other content into the Platform retain their copyright over that content, but grant ${E.name} a non-exclusive, worldwide, royalty-free and transferable licence to use, reproduce, display and distribute that content in the context of the operation of the Platform.`,
      ],
    },
    {
      heading: "4. General conditions of use",
      body: [
        // ADAPTED: there are no passwords here.
        "4.1 Access and registration. Account registration is necessary to create cuppings, coffees and groups. By registering, the user guarantees that the information provided is truthful, complete and up to date, and is responsible for keeping control of their email and their sign-in links.",
        "4.2 Prohibited uses. The user undertakes not to use the Platform for:",
        {
          list: [
            "Illegal or fraudulent activities or activities contrary to good faith and public order.",
            "Disseminating content that is defamatory, obscene or discriminatory, or that infringes third-party rights.",
            "Impersonating other persons or entities.",
            "Distributing computer viruses, malware or other elements that may damage systems or data.",
            "Carrying out spam, phishing or mass data collection activities without consent.",
            "Interfering with the normal operation of the Platform or its security systems.",
            "Accessing restricted areas or other users' accounts without authorization.",
            "Using the Platform for activities that infringe current regulations on data protection, intellectual property or unfair competition.",
          ],
        },
        `4.3 Suspension and cancellation of accounts. ${E.name} reserves the right to suspend, deactivate or delete, with or without prior notice, the access of any user who breaches this Legal Notice, the Terms and Conditions or applicable law. In serious cases or in the event of repeated breach, the measure may be adopted immediately without prior notification.`,
      ],
    },
    {
      heading: "5. Limitation of liability",
      body: [
        `5.1 Availability of the service. ${E.name} makes reasonable efforts to keep the Platform continuously available, but does not guarantee the absence of interruptions, errors or technical failures. The owner will not be liable for damages arising from lack of availability, transmission errors or loss of data for reasons beyond its control.`,
        // ADAPTED: the source's clause is about an AI packaging scanner.
        `5.2 Accuracy of content and AI. Texts generated with artificial intelligence in the analytics area are indicative and may contain inaccuracies. ${E.name} does not guarantee the accuracy, completeness or suitability of the information provided by AI systems.`,
        `5.3 Third-party content and links. The Platform may include content or links to third-party websites. ${E.name} has no control over those sites and assumes no responsibility for their content, privacy policies or practices. The inclusion of a link does not imply endorsement of, or a commercial relationship with, the owner of that site.`,
        `5.4 User responsibility. The user is responsible for their use of the Platform and for the content they enter. ${E.name} is not liable for damages that may arise from misuse of the Platform by the user or by third parties.`,
      ],
    },
    {
      // ADAPTED: the source describes subscription prices with VAT. There are none today.
      heading: "6. Price information",
      body: [
        "In compliance with Article 10.1(f) LSSI-CE: access to the Platform is currently free of charge. If paid services are offered in the future, prices will be shown in euros (EUR) including the applicable Value Added Tax (VAT), before any purchase.",
      ],
    },
    {
      heading: "7. Data protection and cookies",
      body: [
        `${E.name} processes users' personal data in accordance with Regulation (EU) 2016/679 (GDPR) and Organic Law 3/2018 (LOPDGDD). For full information on how we collect, use and protect your data, see our Privacy Policy, available at ${E.site}/privacidad.`,
        // ADAPTED: the source points to a separate cookie policy; here it is section 9 of the privacy policy.
        "The Platform only uses cookies that are strictly necessary for its operation. The details are in section 9 of the Privacy Policy.",
      ],
    },
    {
      heading: "8. Applicable law and jurisdiction",
      body: [
        "8.1 Legal framework. This Legal Notice is governed by Spanish and European law, in particular:",
        {
          list: [
            "Law 34/2002 of 11 July on information society services and electronic commerce (LSSI-CE).",
            "Royal Legislative Decree 1/2007 of 16 November (LGDCU) — protection of consumers and users.",
            "Regulation (EU) 2016/679 (GDPR) and Organic Law 3/2018 (LOPDGDD) — data protection.",
            "Regulation (EU) 2022/2065 (Digital Services Act / DSA) — digital services.",
            "Regulation (EU) 2024/1689 (Artificial Intelligence Act) — AI systems.",
            "Law 11/2023 of 8 May — accessibility of digital products and services.",
          ],
        },
        "8.2 Jurisdiction. For the resolution of any dispute arising from access to or use of the Platform, the parties submit, expressly waiving any other jurisdiction that might correspond to them, to the jurisdiction of the Courts and Tribunals of the city of Madrid.",
        "Without prejudice to the above, if the user is a consumer under the LGDCU, consumer protection regulations will apply, which may grant jurisdiction to the courts of the consumer's place of residence or to alternative dispute resolution mechanisms (Consumer Arbitration Boards, OMIC).",
      ],
    },
    {
      // ADAPTED: the source links to a full accessibility statement, which does
      // not exist for this app yet (parked by the owner until an audit is done).
      heading: "9. Accessibility",
      body: [
        `${E.name} is committed to digital accessibility in accordance with Law 11/2023 (transposition of the European Accessibility Directive, Directive 2019/882/EU). The Platform aims to conform to the EN 301 549 v3.2.1 standard, which incorporates the Web Content Accessibility Guidelines (WCAG) 2.1 at level AA.`,
        `If you find accessibility barriers on the Platform, you can tell us at ${SUPPORT_EMAIL}. We will handle your request within 15 working days.`,
      ],
    },
    {
      heading: "10. Changes to the legal notice",
      body: [
        `${E.name} reserves the right to modify this Legal Notice at any time to adapt it to legislative, case-law or business changes. Changes will enter into force at the moment of their publication on the Platform.`,
        "Users are advised to review this Legal Notice periodically. Continued access to the Platform after any modification implies acceptance of the changes introduced.",
        `${E.name} | CIF: ${E.cif} | ${E.address} | ${SUPPORT_EMAIL} | ${E.site}`,
      ],
    },
  ],
};
