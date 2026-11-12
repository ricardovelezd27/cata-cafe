// Privacy policy (en). Faithful translation of lib/legal/es/privacy.ts, block
// for block. The Spanish original prevails; see the first intro paragraph.
// Paragraphs marked ADDED / ADAPTED mirror the same paragraphs in the Spanish
// file (they are not in the owner's source document and need the owner's eye).
import { SUPPORT_EMAIL } from "@/lib/siteContact";
import { LEGAL_ENTITY, LEGAL_TEXT_VERSION } from "../company";
import { WAITLIST_RETENTION_MONTHS } from "../config";
import type { LegalDoc } from "../types";

const E = LEGAL_ENTITY;

export const PRIVACY_EN: LegalDoc = {
  title: "Privacy policy",
  version: LEGAL_TEXT_VERSION.en,
  intro: [
    "This is a translation of the Spanish original. In case of discrepancy, the Spanish version prevails.",
    `${E.product} (${E.site}) is a coffee cupping platform operated by ${E.name}. This policy explains which personal data we process, for what purpose, on what legal basis and which rights you have.`,
    "Legal framework: Regulation (EU) 2016/679 (GDPR) and Organic Law 3/2018 (LOPDGDD). Jurisdiction: Spain / European Union.",
  ],
  sections: [
    {
      heading: "1. Data controller",
      body: [
        "In accordance with Article 13 of the GDPR and Article 11 of the LOPDGDD, we inform you that the controller of your personal data is:",
        {
          rows: [
            ["Company name", E.name],
            ["Tax ID (CIF)", E.cif],
            ["Registered office", E.address],
            ...(E.registry ? ([["Commercial Registry", E.registry]] as [string, string][]) : []),
            ["Contact email", SUPPORT_EMAIL],
            ["Website / App", `${E.site} | ${E.product}`],
            [
              "Data Protection Officer (DPO)",
              "Not appointed (not mandatory under Art. 37 GDPR and Art. 34 LOPDGDD for the current volume of processing). This decision will be reviewed as the user base grows.",
            ],
          ],
        },
      ],
    },
    {
      heading: "2. Personal data we process",
      body: [
        "We collect only the data necessary to provide the service.",
        { sub: "2.1 Data you provide to us directly" },
        {
          list: [
            // ADAPTED: the default name is the first part of the address until the person changes it.
            "Identification data: the name under which you are displayed. By default it is the first part of your email; you can change it in your profile.",
            "Contact data: your email address, when you create an account, reserve a founding seat or request a sign-in link.",
            "Profile data: role, country, preferred language and, if you add it, a short biography.",
            "Generated content: cupping sessions, evaluations, scores, descriptors, notes, coffees you register (including origin data such as farm or producer) and cupping groups.",
            // ADDED: guests exist only in this app.
            "If you take part as a guest in a cupping without creating an account: the name you type and an anonymous identifier tied to your browser.",
            // ADDED: group owners enter other people's addresses.
            "If the organizer of a cupping group adds your email address to invite you: that address and, if they provide it, your name.",
            "Communications: the messages you send us by email.",
          ],
        },
        // ADAPTED: the source lists a hashed password; this app has no passwords.
        "We do not use passwords: access is by a link or a code sent to your email, or with your Google account if you choose that option. In that case Google sends us your email address, your name, your profile picture and your Google account identifier.",
        // ADAPTED: the source describes Stripe payments; this app takes no payments.
        "We do not process payment data: the platform currently does not charge for any service.",
        { sub: "2.2 Data collected automatically" },
        {
          list: [
            // ADAPTED: the app's own logs are designed to carry ids and codes only.
            "Technical data of the application: operation and error logs (action name, error code and internal identifiers). We deliberately do not log the content of your evaluations or your email.",
            "Device and connection data: our hosting and authentication providers record technical data of each request (IP address, browser and device type, requested path and timestamps).",
            // ADDED: the email rate limit ledger (keyed hash of IP / address).
            "To limit abuse of sign-in emails we use your IP address and the destination address transiently, and we store only a keyed fingerprint of both, which does not allow the original data to be recovered.",
            "Storage on your device: drafts of your evaluations so that you can cup offline, a copy of the data of your cuppings, interface preferences and copies of pages already visited (see section 9).",
          ],
        },
        { sub: "2.3 Data NOT collected" },
        {
          list: [
            // ADDED: the second sentence (free-text fields exist in this app).
            "We do not ask for special categories of data (health, racial origin, beliefs, etc.). Please do not include them in notes or free-text fields.",
            // ADAPTED: the source says microphone, camera and contacts; location added (blocked by the app's headers).
            "We do not access the microphone, the camera, the location or the contacts of your device.",
            "We do not sell or transfer data to third parties for advertising purposes.",
            // ADDED: verified in the code (no analytics, pixel or tag manager).
            "We do not use analytics or advertising cookies, or third-party tracking tools.",
          ],
        },
      ],
    },
    {
      heading: "3. Purposes of processing and legal bases",
      body: [
        "Each processing activity is based on one of the legal bases of Article 6 of the GDPR:",
        {
          list: [
            "Account management and authentication — Art. 6(1)(b), performance of a contract. It does not allow objection (it is essential).",
            "Provision of the service (cupping sessions, results, PDF reports, coffees and groups) — Art. 6(1)(b), performance of a contract.",
            // ADDED: the waitlist / founding seats, with the proposed retention.
            `Founding seat reservation — Art. 6(1)(b), pre-contractual measures at your request: we keep your email to send you access and to notify you about founding seats. If you do not end up creating an account, we keep it for a maximum of ${WAITLIST_RETENTION_MONTHS} months.`,
            "Service communications (sign-in links, results of a cupping you took part in, closing reminders) — Art. 6(1)(b), performance of a contract.",
            // ADDED: group mail to addresses supplied by a group owner.
            "Notices from a cupping group to the addresses its organizer added — Art. 6(1)(f), legitimate interest in the group being able to organize itself. Every email includes a link to stop receiving them.",
            "Security, abuse prevention and technical logs — Art. 6(1)(f), legitimate interest.",
            "Internal usage statistics, produced from aggregated data in our own database and without cookies — Art. 6(1)(f), legitimate interest. You may object by writing to us.",
            "Marketing and newsletters — Art. 6(1)(a), consent. We currently do not send commercial communications (see section 11).",
            "Compliance with legal obligations — Art. 6(1)(c).",
          ],
        },
        `Note on legitimate interest: where we base a processing activity on Art. 6(1)(f), we have carried out the corresponding balancing test and concluded that our interests do not override your fundamental rights and freedoms. You may request information about that test by writing to us at ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: "4. Recipients and processors",
      body: [
        "Your data may be disclosed to the following service providers, which act as processors (Art. 28 GDPR):",
        {
          rows: [
            // ADAPTED: the project's region is Central EU (Frankfurt), checked in the Supabase dashboard on 2026-11-13.
            ["Supabase Inc.", "Database, authentication, sending of sign-in emails and real-time synchronization. The data is hosted in the European Union (Frankfurt). US company — standard contractual clauses and signed data processing agreement. supabase.com/privacy"],
            // ADAPTED: the source lists Stripe and Lovable Cloud; this app uses Vercel and Resend.
            ["Vercel Inc.", "Application hosting and technical logs. USA — with the safeguards of Chapter V of the GDPR. vercel.com/legal/privacy-policy"],
            ["Resend (Plus Five Five, Inc.)", "Sending of service emails (results, invitations, reminders). USA — with the safeguards of Chapter V of the GDPR. resend.com/legal/privacy-policy"],
            ["Google LLC", "Sign-in with Google, if you choose it, and the Gemini artificial intelligence model (see section 8). USA — EU-US Data Privacy Framework. policies.google.com/privacy"],
          ],
        },
        "We do not disclose your data to third parties for their own purposes without your explicit consent. We do not carry out international transfers other than the above, all with adequate safeguards under Chapter V of the GDPR.",
        // ADDED: what other users of a shared cupping can see.
        "Within the platform, the organizer of a cupping sees the name and the evaluations of those who take part in it, and the members of a cupping group see the names of the other members. People who have cupped with you in a group cupping can see your name, your role and the name of the last cupping you shared when they form a group. Coffees that their creator makes public or shares are visible to other people. Platform administrators may access the data to provide support and produce statistics.",
      ],
    },
    {
      heading: "5. Minors",
      body: [
        "In accordance with Article 7 of the LOPDGDD, the minimum age to consent to the processing of data in Spain is 14. Persons under 14 require the consent of the holder of parental authority or guardianship. Note: the PLOPMED bill (approved in March 2025, pending parliamentary approval) will raise this limit to 16 for digital services; this policy will be updated when it enters into force.",
        // OWNER DECISION NEEDED: kept from the source. There is no age check in the
        // product, and "delete the account immediately" needs account deletion
        // enabled (ACCOUNT_DELETION_ENABLED is off until the runbook §24 rehearsal).
        `${E.product} is not aimed at persons under 14. If you are a parent or guardian and suspect that your child under 14 has created an account, please let us know at ${SUPPORT_EMAIL}. We will delete the account and the associated data immediately.`,
      ],
    },
    {
      heading: "6. Your rights",
      body: [
        "In accordance with Articles 15 to 22 of the GDPR and Articles 13 to 18 of the LOPDGDD, you have the following rights regarding your personal data:",
        {
          list: [
            "Access: obtain a copy of the data we process about you (Art. 15 GDPR / Art. 13 LOPDGDD).",
            "Rectification: correct inaccurate or incomplete data (Art. 16 GDPR / Art. 14 LOPDGDD).",
            "Erasure: request the deletion of your data when, among other reasons, it is no longer necessary. The data will be «blocked» before its final deletion in accordance with Art. 32 LOPDGDD (Art. 17 GDPR / Art. 15 LOPDGDD).",
            "Restriction of processing: suspend processing in certain circumstances (Art. 18 GDPR / Art. 16 LOPDGDD).",
            "Portability: receive your data in a structured, machine-readable format (Art. 20 GDPR / Art. 17 LOPDGDD).",
            "Objection: object to processing based on legitimate interest (Art. 21 GDPR / Art. 18 LOPDGDD).",
            "Not to be subject to automated decisions with significant effects (Art. 22 GDPR).",
            "Withdrawal of consent at any time, without affecting the lawfulness of prior processing (Art. 7(3) GDPR).",
          ],
        },
        { sub: "How to exercise your rights" },
        {
          list: [
            `Send an email to ${SUPPORT_EMAIL} with the subject «Exercise of GDPR rights».`,
            "State the right you wish to exercise, attach a copy of your DNI/NIE or another valid identity document and give the details of your request.",
            "We will reply within one month (Art. 12.3 GDPR). In complex cases, the period may be extended by up to three months, and we will notify you within the first month.",
            "If you consider that we have not handled your request properly, you may lodge a complaint with the Spanish Data Protection Agency (AEPD): www.aepd.es — Calle Jorge Juan 6, 28001, Madrid.",
          ],
        },
      ],
    },
    {
      heading: "7. Data security",
      body: [
        "We apply appropriate technical and organizational measures under Article 32 of the GDPR to protect your data against unauthorized access, accidental loss, destruction or alteration:",
        {
          list: [
            "Encryption in transit using TLS in all communications.",
            // ADAPTED: the source describes password hashing; this app has no passwords.
            "Passwordless access: single-use links and codes sent to your email.",
            "Permission checks on the server for every operation and row-level security in the database: each person accesses their own data, the cuppings they take part in and what other people have shared with them or made public.",
            "Role-based access control (cupping organizer, participant, administrator).",
            "Rate limiting to prevent abuse of sign-in emails.",
            // ADAPTED: the source also commits to regular key rotation and periodic
            // security audits; neither is a process this product can show today.
            "Service keys are used only on the server, with the minimum privileges necessary.",
          ],
        },
        "Notification of security breaches: in the event of a security breach that may entail a risk to your rights and freedoms, we will notify the AEPD within a maximum of 72 hours of becoming aware of it (Art. 33 GDPR). If the breach is likely to result in a high risk to you, we will inform you directly without undue delay (Art. 34 GDPR).",
      ],
    },
    {
      // ADAPTED: the source section is about an AI packaging scanner, which this app does not have.
      heading: "8. Artificial intelligence",
      body: [
        "Transparency notice (Art. 50 of Regulation (EU) 2024/1689): some functions of the analytics area generate texts with artificial intelligence. Those texts may contain inaccuracies.",
        {
          list: [
            `${E.name} acts as «deployer» for the purposes of the EU AI Act; Google LLC acts as «provider» of the Gemini model.`,
            "To write the summaries in the analytics area, aggregated figures and labels are sent to the model (averages, counts, names of origins or processes). When the person querying breaks down their own cuppings by cupper, the labels include the names of those cuppers. Individual evaluations, notes and email addresses are not sent.",
            "The analytics assistant, reserved for platform administrators, additionally sends the question typed by the administrator and the names of cupping sessions.",
            "No automated decisions are made about you with these systems.",
          ],
        },
      ],
    },
    {
      // ADAPTED: replaces the source's cookie section and its separate cookie
      // policy (banner, analytics and advertising cookies), none of which exist here.
      heading: "9. Cookies and storage on your device",
      body: [
        "We use cookies in accordance with Article 22.2 of the LSSI. We only use strictly necessary cookies, which do not require consent; for that reason we do not show a cookie consent panel:",
        {
          rows: [
            ["User session (Supabase cookies, named «sb-…-auth-token»)", "They keep you signed in. They are renewed while you use the application and expire after 400 days at most."],
            ["Sign-in with Google (Supabase cookie, named «sb-…-auth-token-code-verifier»)", "Protects sign-in with Google. It is deleted when sign-in is completed."],
            ["cata_signin_intent", "Protects sign-in: remembers, by means of a keyed fingerprint, that the sign-in link was requested from this browser. 1 hour."],
            ["cata_signin_pending", "Protects sign-in when the link is opened in another browser, until you confirm who you are. 10 minutes."],
          ],
        },
        "We do not use analytics, advertising or third-party cookies for tracking purposes.",
        "In addition, the application stores on your device (the browser's local storage) what it needs to work: the drafts of your evaluations, so that you can cup offline and not lose work; a copy of the data of your cuppings; your interface preferences; and copies of pages already visited. When you sign out, the page copies are deleted. The drafts and the copy of the data of your cuppings remain on the device until you discard them or delete the browser data.",
        "You can delete cookies and storage from your browser settings. If you do, you will have to sign in again and you will lose any drafts that have not been synchronized. On a shared device, delete the browser data when you finish.",
      ],
    },
    {
      heading: "10. Retention periods and blocking",
      body: [
        "Personal data will be kept for the time necessary for the purpose for which it was collected, always respecting the minimum legal retention periods.",
        {
          list: [
            // ADAPTED: the source adds tax retention periods tied to payments, which do not exist here.
            "Account data and content: while the account exists.",
            // ADDED: what account deletion really does in this app.
            "When the account is deleted, the profile, the history and the access data are erased. The evaluations you made in cuppings shared with other people are kept without your name, so that other people's results do not change; the cuppings you organized and in which other people took part are kept closed and without your name; and the coffees you created are kept without their identifying data (name, farm, producer, notes).",
            `Founding seat reservation without an account: a maximum of ${WAITLIST_RETENTION_MONTHS} months. If you created an account, the reservation is kept while the account exists and is deleted when you delete it.`,
            // ADDED: addresses a group organiser enters for other people.
            "Addresses added to a cupping group by its organizer: while the group exists or until the organizer removes them.",
            "Fingerprints used to limit email sending: deleted automatically when they are no longer needed.",
            // ADAPTED: the source says 12 months; the retention of provider logs is set by the providers.
            "Technical logs: for a limited period, for security.",
            "Security breach records: 3 years (accountability, Art. 5(2) GDPR).",
          ],
        },
        // OWNER DECISION NEEDED: kept from the source. Today account deletion erases
        // or anonymises in one step (lib/accountDeletion); no code "blocks" data first.
        "Blocking obligation (Art. 32 LOPDGDD): Spanish law requires that, before your data is finally deleted, it be «blocked», that is, inaccessible for ordinary processing but kept available to courts, the public prosecutor or competent public authorities. Once the statutory limitation period has elapsed, the data will be securely and irreversibly deleted.",
      ],
    },
    {
      heading: "11. Commercial communications",
      body: [
        "In accordance with Article 21 of the LSSI and Article 6(1)(a) of the GDPR, we will only send you commercial communications, newsletters or marketing notifications if you have given your express and unequivocal consent.",
        {
          list: [
            // ADAPTED: states the present situation.
            "We currently do not send commercial communications.",
            "Consent to receive marketing is always optional and does not condition the provision of the service.",
            `You may withdraw your consent at any time by writing to ${SUPPORT_EMAIL}.`,
            "We will never send emails asking for permission to send marketing: such an email would itself be an unsolicited communication and would infringe Art. 21 LSSI.",
            "Service communications (sign-in links, results of a cupping, closing notices, security alerts) are not commercial communications and are sent on the basis of the contract.",
          ],
        },
      ],
    },
    {
      heading: "12. Changes to this policy",
      body: [
        "We reserve the right to update this Privacy Policy when necessary, for example because of regulatory changes, new features of the service or changes among our providers. In the event of substantial changes:",
        {
          list: [
            "We will notify you by email or through a prominent notice in the application at least 30 days in advance.",
            "The version and the date of the last update are always shown in the header of the document.",
            "If you do not agree with the changes, you may request the deletion of your account before they enter into force.",
            "Continued use of the service after the changes enter into force implies acceptance of the new version of the policy.",
          ],
        },
      ],
    },
    {
      heading: "13. Applicable law and jurisdiction",
      body: [
        "This Privacy Policy is governed by Spanish and European Union law, in particular:",
        {
          list: [
            "Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 (GDPR).",
            "Organic Law 3/2018 of 5 December on the Protection of Personal Data and the guarantee of digital rights (LOPDGDD).",
            "Law 34/2002 of 11 July on information society services and electronic commerce (LSSI-CE).",
            "Regulation (EU) 2024/1689 of the European Parliament and of the Council (Artificial Intelligence Act).",
          ],
        },
        "For any dispute arising from the interpretation or application of this policy, the parties submit to the jurisdiction of the Courts and Tribunals of Madrid, without prejudice to the user's right to go to the AEPD (www.aepd.es) or to the alternative dispute resolution mechanisms available.",
        `${E.name} | CIF: ${E.cif} | ${E.address} | ${SUPPORT_EMAIL} | ${E.site}`,
      ],
    },
  ],
};
