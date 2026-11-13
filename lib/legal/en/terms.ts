// Terms and conditions (en). Faithful translation of lib/legal/es/terms.ts,
// block for block. The Spanish original prevails; see the first intro paragraph.
// Paragraphs marked ADDED / ADAPTED mirror the same paragraphs in the Spanish
// file (they are not in the owner's source document and need the owner's eye).
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import { LEGAL_ENTITY, LEGAL_TEXT_VERSION } from "../company";
import type { LegalDoc } from "../types";

const E = LEGAL_ENTITY;

export const TERMS_EN: LegalDoc = {
  title: "Terms and conditions",
  version: LEGAL_TEXT_VERSION.en,
  intro: [
    "This is a translation of the Spanish original. In case of discrepancy, the Spanish version prevails.",
    `These Terms and Conditions (hereinafter, the «T&C») govern access to, registration on and use of the ${E.product} platform, available at ${E.site} (hereinafter, «the Platform»), operated by ${E.name}.`,
    "By accessing or using the Platform, the user fully accepts these T&C. If the user does not agree with any of their terms, the user must refrain from using the Platform.",
  ],
  sections: [
    {
      heading: "1. Parties to the contract",
      body: [
        {
          rows: [
            ["Service provider", `${E.name} — CIF ${E.cif}`],
            ["Registered office", E.address],
            ["Contact", SUPPORT_EMAIL],
            ["User", "Any natural person over 14 years of age who accesses, registers on or uses the Platform"],
            ["Relationship", "Contract for the provision of digital services at a distance (LGDCU Art. 92 et seq.; LSSI-CE Art. 23)"],
          ],
        },
      ],
    },
    {
      // ADAPTED: the source describes a catalogue, an AI scanner, a learning
      // module and a marketplace. This describes what Café Sensible offers.
      heading: "2. Purpose of the service",
      body: [
        `${E.product} is a digital platform for organizing coffee cuppings and recording sensory evaluations. It offers the following services:`,
        {
          list: [
            "Cupping sessions: creation of individual or group cuppings, blind, with invitation by link or QR code.",
            "Sensory evaluation: descriptive and affective forms based on the SCA CVA methodology, with score calculation.",
            "Results and reports: individual and group results, and PDF reports.",
            "Coffees and groups: registration of coffees with their origin data, and cupping groups to organize the people who cup together.",
            "Sensory Movement (Movimiento Sensorial): guided preparation exercises before cupping.",
          ],
        },
        // ADDED: there are no paid plans today; the source's billing section was removed.
        "Access to the Platform is currently free of charge. If paid plans are offered in the future, their conditions and prices will be communicated before any purchase.",
      ],
    },
    {
      heading: "3. Account registration and user obligations",
      body: [
        { sub: "3.1 Registration requirements" },
        {
          list: [
            "The user must be over 14 years of age. Persons under 14 require the express consent of their legal guardians.",
            // ADAPTED: the source asks for a password; access here is by link, code or Google.
            "The user must provide a valid email address. Access is by a link or a code sent to that email, or with a Google account.",
            "Each natural person may keep a single active account, unless expressly authorized by the provider.",
            "The account is personal and non-transferable.",
            // ADDED: guests.
            "It is possible to take part in a cupping as a guest, without an account, by giving a name. A guest's access is tied to the browser they used and is lost if they delete their browsing data, unless they save their results by creating an account.",
          ],
        },
        { sub: "3.2 User obligations" },
        {
          list: [
            `Keep control of their email and their sign-in links, and immediately notify any unauthorized use to ${SUPPORT_EMAIL}.`,
            "Provide truthful, complete and up-to-date information in registration and profile.",
            "Use the Platform in accordance with applicable law, good faith and public order.",
            "Not share, sell or transfer access to their account to third parties.",
            // ADDED: owners enter other people's data (group emails, producers).
            "If they enter data of other people (for example, the email addresses of a cupping group or the details of a producer), guarantee that they are authorized to do so.",
          ],
        },
        { sub: "3.3 Prohibited uses" },
        "The following is expressly prohibited:",
        {
          list: [
            "Using the Platform for illegal or fraudulent activities or activities that infringe third-party rights.",
            "Publishing defamatory, obscene or discriminatory content, or content that infringes intellectual property rights.",
            "Reverse engineering, decompiling or extracting the source code of the application.",
            "Using bots, scrapers or automated tools to access or extract data from the Platform.",
            "Impersonating another user or entity.",
            "Interfering with the security systems or the technical infrastructure of the Platform.",
            "Creating multiple accounts to circumvent previous suspensions or restrictions.",
          ],
        },
      ],
    },
    {
      // ADDED: the owner / participant rule that the product applies everywhere.
      heading: "4. Cuppings, organizers and participants",
      body: [
        "Whoever creates a cupping, a coffee or a group is its organizer: they can edit and delete it, and invite or exclude participants; in a cupping, they can also close it. Deleting a coffee removes its identifying data, but keeps the evaluations that other people made of it. Participants take part in the cupping and see their own results; the group's results are shown when the cupping ends.",
        "A closed cupping stays as a record: nobody can change the evaluations already submitted. The organizer can make limited corrections after closing (for example, excluding a participant or completing the origin data of a coffee); the results then show the date of the update. If a participant deletes their account, their evaluations in cuppings shared with other people are kept without their name, so that other people's results do not change.",
        // ADAPTED from the source's "no professional certification" clause for its learning module.
        "The scores and reports of the Platform are for training and working purposes. They do not constitute a professional certification nor are they equivalent to an assessment accredited by any official body.",
      ],
    },
    {
      heading: "5. Intellectual property",
      body: [
        `5.1 Ownership of content. All content of the Platform — including source code, design, logos, exercises, texts and reference data — is owned by ${E.name} or licensed by third parties, and is protected by the Intellectual Property Act (Royal Legislative Decree 1/1996) and international regulations.`,
        // ADAPTED: the source limits the licence to "personal, non-commercial purposes".
        // Dropped here because this product is used professionally (courses, labs, producers).
        `5.2 Licence of use. ${E.name} grants the user a personal, non-exclusive, non-transferable and revocable licence to access and use the Platform on the terms set out in these T&C.`,
        `5.3 User-generated content. The user retains ownership of the evaluations, cupping notes, coffee records and ratings they publish on the Platform. By publishing them, they grant ${E.name} a worldwide, non-exclusive, royalty-free, sublicensable and transferable licence to reproduce, distribute, display and adapt that content in the context of the operation and promotion of the Platform.`,
        "The user guarantees that the content they publish does not infringe third-party rights and assumes full responsibility for it.",
      ],
    },
    {
      // ADDED: replaces the source's subscription terms. The founding offer's
      // conditions are the owner's to write.
      heading: "6. Founding seats",
      body: [
        "Reserving a founding seat implies no payment and no commitment to purchase. The conditions of the founding offer will be communicated to those who have reserved a seat before they enter into force.",
      ],
    },
    {
      heading: "7. Artificial intelligence",
      body: [
        // ADAPTED: the source's AI clause is about a packaging scanner.
        `Some functions of the analytics area generate texts with artificial intelligence (Gemini model of Google LLC). ${E.name} acts as «deployer» and Google LLC as «provider» of the model (Regulation (EU) 2024/1689). The results are purely informative and may contain inaccuracies; ${E.name} does not guarantee their accuracy, completeness or suitability for any specific use.`,
      ],
    },
    {
      heading: "8. Limitation of liability",
      body: [
        // ADAPTED: the source promises 24 hours of notice before scheduled maintenance; this
        // product has no channel to announce maintenance, so the promise is not made.
        `8.1 Availability of the service. ${E.name} undertakes to make reasonable efforts to keep the Platform continuously available, but does not guarantee 100% availability. It will not be liable for interruptions due to maintenance, failures of third-party infrastructure providers or force majeure, nor for losses arising from such interruptions.`,
        `8.2 Accuracy of content. The information about coffees and the content of the Platform are provided «as is». ${E.name} does not guarantee that they are exhaustive, error-free or up to date at all times.`,
        // OWNER DECISION NEEDED: kept from the source. While access is free, "the amount
        // paid in the 12 months" is zero.
        `8.3 Exclusion of indirect damages. To the maximum extent permitted by applicable law, ${E.name} will not be liable for indirect damages, loss of profit, loss of data or any consequential damage arising from the use of, or inability to use, the Platform. The total maximum liability towards a user will not exceed the amount paid by that user in the 12 months preceding the event giving rise to the damage.`,
        `8.4 Unfair terms (LGDCU Arts. 82–90). The above limitations of liability do not apply to: (a) death or personal injury caused by the negligence of ${E.name}; (b) fraud or wilful misconduct of the provider; (c) non-waivable consumer rights under Spanish law. No clause of these T&C is intended to limit rights that the law grants to the consumer on a non-waivable basis.`,
      ],
    },
    {
      heading: "9. Changes to the terms",
      body: [
        `${E.name} may modify these T&C when necessary because of regulatory changes, new features or legitimate business reasons.`,
        {
          list: [
            "The user will be notified by email or through a prominent notice on the Platform at least 30 days before the changes enter into force.",
            // ADAPTED: the source says "cancel their subscription without penalty"; there are no subscriptions.
            "The user may stop using the Platform and request the deletion of their account before the date of entry into force if they do not accept the changes.",
            "Continued use of the Platform after entry into force implies acceptance of the new terms.",
            "In no case will the essential terms of the contract be modified unilaterally to the detriment of the user without their express consent (LGDCU Art. 85).",
          ],
        },
      ],
    },
    {
      heading: "10. Suspension and termination of the contract",
      body: [
        { sub: "10.1 By the user" },
        {
          list: [
            // ADAPTED: the source points to an in-app delete button, which is not enabled yet.
            `The user may request the deletion of their account at any time by writing to ${SUPPORT_EMAIL}.`,
            "Deleting the account implies the loss of the profile, the history and other associated data, which will be blocked and subsequently deleted in accordance with Art. 32 LOPDGDD. Evaluations made in cuppings shared with other people, and the cuppings the user organized and in which other people evaluated, are kept without the user's name.",
          ],
        },
        { sub: "10.2 By the provider" },
        {
          list: [
            `${E.name} may suspend or cancel an account, with or without notice, in the event of: serious breach of these T&C; fraudulent or abusive conduct; or legal requirement.`,
            "In the event of suspension for a minor breach, the user will be notified 7 days in advance and given the opportunity to remedy the situation.",
          ],
        },
      ],
    },
    {
      heading: "11. Data protection",
      body: [
        `The processing of personal data arising from the use of the Platform is governed by our Privacy Policy, available at ${E.site}/en/privacidad, which forms an integral part of these T&C.`,
        `${E.name} processes data in accordance with the GDPR (Regulation (EU) 2016/679) and the LOPDGDD (Organic Law 3/2018). The data controller is ${E.name}, CIF ${E.cif}, with registered office at ${E.address}.`,
      ],
    },
    {
      heading: "12. Applicable law and dispute resolution",
      body: [
        "These T&C are governed by Spanish and European Union law. The following apply in particular:",
        {
          list: [
            "Royal Legislative Decree 1/2007 (LGDCU) — protection of consumers and users.",
            "Law 34/2002 (LSSI-CE) — information society services.",
            "Regulation (EU) 2022/2065 (DSA) — digital services.",
            "Regulation (EU) 2024/1689 — Artificial Intelligence Act.",
            "Regulation (EU) 2016/679 (GDPR) and Organic Law 3/2018 (LOPDGDD).",
          ],
        },
        "For any dispute that cannot be resolved amicably, the parties submit to the jurisdiction of the Courts and Tribunals of Madrid. However, if the user is a consumer, they may go to the courts of their place of residence or to alternative dispute resolution mechanisms: the Consumer Arbitration Boards (Juntas Arbitrales de Consumo) of their municipality or autonomous community, the Municipal Consumer Information Offices (OMIC) and AECOSAN (Spanish Agency for Consumer Affairs, Food Safety and Nutrition).",
        `${E.name} | CIF: ${E.cif} | ${E.address} | ${SUPPORT_EMAIL} | ${E.site}`,
      ],
    },
  ],
};
