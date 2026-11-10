---
domain: asset-admin
researched: 2026-11-06
model: claude-sonnet
flows: [Editar y administrar sesiones, Cafés, Grupos]
---

# Asset administration: CRUD, sharing, membership, destructive actions

Evidence note: sources marked (secondary) were reached through search summaries, not the primary page. Where primary guidance (Material 3, Baymard, Figma, NN/g confirmation article) could not be retrieved, the principle is marked as practice-derived and appears again in section 7.

## 1. Scope

Covers the owner-managed assets: sessions (edit, samples, reference, delete), coffees (catalogue, short codes, visibility tiers, anonymizing delete, bulk table actions) and groups (roster, invites, feed, leave). Covers destructive-action UX, edit-while-in-use, sharing tiers, membership, identifiers, mobile lists and audit trails. Leaves to other briefs: auth and guest claim (`auth-identity`), session creation wizard (`session-setup`), live cupping and realtime (`live-collab`), offline queueing (`offline-native`), scoring and reports.

## 2. Principles

1. **Prefer undo for reversible actions; reserve blocking confirmation for irreversible or high-impact ones.** Users habituate to dialogs and click through; every destructive action needs either a confirmation or an undo offer. Source: GNOME HIG dialogs (2025); Apple HIG Alerts (2025).
2. **A confirmation must be specific.** Name the object, state what happens, label the button with the verb ("Eliminar café"), make Cancel the safe default, and never use the destructive style for a deliberate routine action. Source: Apple HIG Alerts (2025); GNOME HIG (2025).
3. **Show impact before commit.** A confirmation for something that touches other people's data states the counts ("this affects 12 tastings, 4 cuppers") so the user sees the cascade before it happens. Practice-derived; consistent with Apple HIG's "alert for uncommon irreversible actions" and GNOME HIG's "warn the user". Source: Apple HIG Alerts (2025).
4. **Destruction that other records depend on should be anonymize/archive, not row delete.** Keep referential integrity and aggregates; wipe identifying fields. Source: EDPB Guidelines 02/2026 on Anonymisation (2026) and ICO anonymisation guidance (2025): effectively anonymised data falls outside erasure rights, so anonymisation is a legitimate end state only if re-identification is not reasonably likely (secondary for ICO wording).
5. **Anonymization must actually anonymize.** Name, code, farm, producer, free notes and anything searchable that could single out the owner must be wiped, and retained attributes must not re-identify in combination. If it is only pseudonymised, erasure duties remain. Source: EDPB Guidelines 01/2025 on Pseudonymisation (2025); EDPB 02/2026 (2026).
6. **Say what survives.** The delete UI tells the owner what is kept (other cuppers' snapshots, aggregate analytics) and what is removed. Erasure requests are subject to active EU enforcement attention. Source: EDPB coordinated enforcement on Art. 17 (2025).
7. **Restore windows need an owner-visible state.** If something is soft-deleted or archived, there is a way to see and restore it within a stated period, or the UI says it is final. Practice-derived; see GNOME HIG undo guidance (2025).
8. **Authorization is enforced server-side on the specific object for every mutation, deny by default.** Hidden buttons are not a control; unguessable ids do not replace the check. Source: OWASP Authorization Cheat Sheet (2025); OWASP IDOR page (2025).
9. **Never trust client-supplied foreign ids or derived values.** Re-validate any referenced object (coffee, sample, session) against the caller's access. Source: OWASP IDOR (2025).
10. **Concurrent edits are detected, not silently overwritten.** Use a version or `updatedAt` precondition (the HTTP analogue is ETag + `If-Match`, failing with 412) and give the loser a recoverable message. Source: RFC 9110 conditional requests (2022; secondary summary).
11. **Retries and double taps are idempotent.** Creating or inviting twice must not produce two objects or two emails; the key is client-generated and replays return the stored result. Source: Stripe API idempotent requests (2026).
12. **Freeze what has meaning once data depends on it.** After the first evaluation exists, changes that alter what scores mean (format, cups per sample, sample identity, warm-up) are locked; additive or cosmetic edits stay open; closed means read-only except named exceptions. Practice-derived; analogous to Stripe's rule that a settled object is immutable except named fields (2026).
13. **Sharing has few, named tiers with plain-language labels and a safe default.** Private/restricted is the default; link access is a separate explicit choice; roles are viewer/commenter/editor-style. Source: Google Drive sharing help (2025); Notion sharing & permissions (2025).
14. **Show who has access and let the owner change or revoke it in one place.** Notion requires at least one full-access holder and offers request-access; Drive separates owner from editor. Source: Notion sharing & permissions (2025); Google Drive (2025).
15. **Link invites are bounded: expiry, max uses, revocation, and no burn on owner/repeat opens.** Drive supports expiry for eligible accounts; the same logic applies to invite tokens. Source: Google Drive sharing help (2025).
16. **Invite-by-email shows state: pending vs accepted, resend, remove.** Do not reveal whether an address already has an account to the inviter beyond what the roster needs; keep responses uniform. Source: OWASP enumeration guidance for recovery flows (secondary, extrapolated to invites) (2025).
17. **Mask personal data by default in rosters; the least-privileged viewer sees the least.** Practice-derived; GDPR data-minimisation (Art. 5(1)(c)) (2016).
18. **A participant can always leave; an owner cannot orphan the asset.** Leave is member-only and self-service; ownership cannot be left in a state with no owner (Notion's "at least one Full access"). Source: Notion sharing & permissions (2025).
19. **Human-friendly codes: unambiguous alphabet, case-insensitive, hyphen-grouped, tolerant on input, unique with collision handling.** Crockford Base32 excludes I L O U, ignores hyphens and case and maps look-alikes. Source: Crockford Base32 specification (secondary implementations) (2019).
20. **Codes are identifiers, not secrets.** Searching by code must still pass authorization. Source: OWASP IDOR (2025).
21. **Lists: select-all, contextual action bar showing the count, feedback after the action, and undo.** Source: NN/g Bulk Actions guidelines (2025).
22. **Bulk destructive actions state the number and the impact and are never the default tap target.** Practice-derived; Apple HIG (2025).
23. **Phone tables become stacked cards; do not scroll horizontally in two axes.** Prioritise columns; keep filtering and search reachable. Source: NN/g mobile tables guidance (secondary) (2025).
24. **Touch targets of about 44 pt / 48 dp on every row action.** Source: Apple HIG Layout (2025); Material accessibility (2025) (not fetched).
25. **Empty states explain and offer the next action; a filtered-to-zero state offers "clear filters".** Practice-derived.
26. **Owner actions leave a trace the owner can read.** At minimum who/what/when for membership changes, sharing changes, closes and deletes; free of PII beyond what the viewer is entitled to. Practice-derived (see section 7).
27. **Every failure of a server action is shown, localized.** A destructive action that fails silently is worse than one that never offered. Source: GNOME HIG feedback (2025).

## 3. Audit checklist

1. Does every delete/anonymize/remove path either confirm with a specific message or offer undo? (P1, P2)
2. Do confirmations name the object and use a verb-specific button label with Cancel as the safe default? (P2)
3. Does the delete dialog for sessions/coffees/groups display counts of affected tastings, cuppers, or members before commit? (P3)
4. Does the dialog state what is retained (snapshots, aggregates) versus removed? (P6)
5. Does coffee delete wipe name, code, farm, producer, notes, certifications and any free text, and keep only non-identifying analytics attributes? (P4, P5)
6. Is a deleted/anonymized coffee excluded from search, code lookup, pickers and shared/public listings? (P5, P20)
7. Is there either a documented restore path or an explicit "final" statement for each destructive action? (P7)
8. Does every mutation call an object-level authorization helper (owner or member) with the id taken from the database, not the client? (P8, P9)
9. Are foreign ids (coffee, sample, user) re-validated against the caller's access before linking? (P9)
10. Do mutations on a shared object carry a version/`updatedAt` check, or is last-write-wins documented as accepted? (P10)
11. Are create-type actions (create session, invite, add sample, share) safe against double submit (disabled button, idempotency key, or unique constraint mapped to a friendly error)? (P11)
12. After the first evaluation exists, are format, cups per sample, sample identity and similar score-meaning fields rejected server-side, not just disabled in UI? (P12)
13. Are closed-session writes rejected in every action, and are the sanctioned exceptions the only exceptions? (P12)
14. Are the visibility tiers named in plain language, defaulting to private, with the current tier visible on the asset? (P13)
15. Can the owner see who has access and revoke it from one screen? (P14)
16. Do invite links have expiry and max uses enforced transactionally, and do owner/repeat opens avoid consuming a use? (P15)
17. Can the owner revoke an outstanding invite link, and does it stop working immediately? (P15, P14)
18. Does the roster show pending versus joined, with resend and remove? (P16)
19. Is the response to inviting an existing versus new email indistinguishable to the inviter, apart from roster state? (P16)
20. Are member emails masked for everyone who is not the owner, and is the roster hidden from non-members? (P17)
21. Can a member leave without owner action, and does leaving not delete shared history? (P18)
22. Can ownership become absent (owner account deleted or left) with no defined outcome? (P18)
23. Is the short code generated from an unambiguous alphabet, shown grouped, and matched case- and hyphen-insensitively on search? (P19)
24. Is code uniqueness enforced by the database with collision retry, and does lookup by code go through access checks? (P19, P20)
25. Do list pages offer select-all, a contextual bar with count, success feedback and undo for bulk actions? (P21, P22)
26. Do tables render as stacked cards on phone width with no horizontal scroll, and do row actions meet the touch-target size? (P23, P24)
27. Do empty and zero-result states give a reason and a next action? (P25)
28. Is there a stored record (table or log) of owner actions: share change, member add/remove, close, delete, with actor and time? (P26)
29. Does every interactive action that can fail surface a localized error rather than throw or fail silently? (P27)
30. Are bulk deletes limited to the caller's own assets, with each id re-checked server-side rather than filtered in the client? (P8, P22)

## 4. Anti-patterns

- **"Are you sure?" with Yes/No.** Generic wording gets clicked through; the user cannot tell what is lost. (P2)
- **Confirm-only for reversible edits.** Dialog fatigue trains users to dismiss the dialogs that matter. (P1)
- **Delete that silently cascades.** The user learns of lost tastings later. (P3, P6)
- **Soft delete that leaves the data findable.** Name stays in search, code resolves, the public tier still lists it. (P5)
- **Anonymization that keeps unique combinations** (exact farm + harvest + altitude + producer notes) which re-identify the owner. (P5)
- **UI-only locking.** A disabled field with an open server action. (P8, P12)
- **Last-write-wins on a shared object with no signal.** Two devices edit; one change vanishes. (P10)
- **Invite responses that differ for known versus unknown emails.** Turns the invite box into an account-existence oracle. (P16)
- **Invite link that burns a use when the owner opens it.** Seats run out before guests arrive. (P15)
- **Unmasked emails in a member-visible roster.** (P17)
- **Using the code as the permission.** Anyone who guesses a code reads a private coffee. (P20)
- **Bulk "select all" that silently means "all pages".** The count in the bar is the safeguard. (P22)
- **Horizontal-scrolling desktop table on a phone.** (P23)
- **Owner trapped:** the last owner can leave or be removed. (P18)

## 5. Native-app considerations

- **Swipe and long-press are hidden.** Swipe-to-delete and long-press multi-select must also exist as visible controls; otherwise discoverability and accessibility fail. Apple HIG Lists (2025, not fetched).
- **Destructive style.** On iOS, use the system destructive style and a titled Cancel (Apple HIG Alerts, 2025); on Android prefer a snackbar with Undo for reversible actions (Material, not fetched in this research).
- **Share targets.** Invite and join links should use the native share sheet; the app needs deep-link/universal-link handling so a tapped invite opens the app, with the web page as fallback. Practice-derived.
- **Back gesture and hardware back** must dismiss the confirmation or selection mode before leaving the page. Practice-derived.
- **Offline.** Destructive and membership actions need connectivity or an explicit queued state; never show success for a deferred delete. See `offline-native`.
- **Store policy.** Apple App Review requires an in-app way to initiate account deletion for apps that support account creation; the analogue for assets is that "delete" must be reachable in-app. (Apple App Store Review Guidelines 5.1.1(v), 2022-2025; not fetched.)
- **Pull-to-refresh and cached lists.** A cached list must not offer an action on an object that was since anonymized or revoked; server rejection must be surfaced. Practice-derived.

## 6. Vocabulary

| Spanish | English | Meaning |
|---|---|---|
| Anonimizar | Anonymize | Remove identifying fields while keeping the row so references and aggregates survive |
| Eliminar | Delete | User-facing label; in this app often anonymization, so the copy must say which |
| Archivar | Archive | Hide from active lists, keep and restorable |
| Deshacer | Undo | Time-limited reversal offered after an action |
| Vista previa de impacto | Impact preview | Counts of affected records shown before commit |
| Propietario / Creador | Owner / Creator | Holder of create/edit/delete rights |
| Participante / Miembro | Participant / Member | Takes part; cannot edit or delete the asset |
| Invitación pendiente | Pending invite | Sent, not yet accepted |
| Reenviar | Resend | Send the invite again without creating a second one |
| Enlace de invitación | Invite link | Token URL with expiry and max uses |
| Visibilidad | Visibility | Private, shared-by-invite, public tier |
| Código corto | Short code | Human-friendly unique identifier (e.g. K7M-3FP) |
| Instantánea | Snapshot | Copy of a user's own data kept after the parent is deleted |
| Bloqueo optimista | Optimistic locking | Version check so a stale write fails |
| Idempotencia | Idempotency | Repeating a request has no extra effect |
| Acción masiva | Bulk action | One action on several selected rows |
| Registro de cambios | Audit trail / change log | Who did what, when |
| Sesión cerrada | Closed session | Read-only state |

## 7. Open practice questions

1. **Undo versus confirm for session delete.** Delete keeps snapshots, so a time-limited undo (soft delete with a purge job) may be possible; a product decision on the restore window is needed.
2. **Can anonymized coffees be restored?** Wiping fields is irreversible by design; does the product accept that, and should the dialog say so?
3. **Retained analytics attributes.** Which attributes on an anonymized coffee (country, process, altitude band, harvest) are safe in combination? Needs a legal read against EDPB 02/2026 after it is finalised (the page showed consultation closed, 8 Jul 2026).
4. **Concurrency model.** Is last-write-wins on session name/date acceptable, or should the owner see "changed on another device"? No primary source retrieved for the best UX.
5. **Audit trail visibility.** Should owners see a change log, or is a server log enough? No primary UX guidance found.
6. **What may a shared-by-invite coffee user edit?** Drive and Notion split viewer/editor; the app's rule is read-only for non-owners. Confirm that stays true.
7. **Ownership transfer.** Notion and Drive support it; the app has no stated path when an owner leaves or deletes the account.
8. **Group email blasts.** Consent, rate limits and unsubscribe for member emails were not researched here.
9. **Material 3, Baymard and Figma sharing docs** were not retrieved; mobile bulk-selection and Figma link-role patterns rest on secondary sources.

## 8. Sources

Newest first. Items marked (secondary) were not read at the primary page.

- EDPB, Guidelines 02/2026 on Anonymisation, 2026 (adopted 8 Jul 2026; page read, text not): https://www.edpb.europa.eu/documents/guideline/guidelines-022026-on-anonymisation_ga
- Stripe, Idempotent requests (API version 2026-04-22): https://docs.stripe.com/api/idempotent_requests
- EDPB, Guidelines 01/2025 on Pseudonymisation, 2025: https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-012025-pseudonymisation_es
- EDPB, coordinated enforcement action on the right to erasure (Art. 17), 2025 (secondary via search)
- ICO, Anonymisation and pseudonymisation guidance, 28 Mar 2025 (secondary): https://www.twobirds.com/en/insights/2025/key-takeaways-from-the-ico’s-final-anonymisation-guidance
- Apple, Human Interface Guidelines: Alerts, 2025: https://developer.apple.com/design/human-interface-guidelines/alerts
- GNOME HIG, Dialogs, 2025: https://developer.gnome.org/hig/patterns/feedback/dialogs.html
- NN/g, Bulk Actions: 3 Design Guidelines, 2025: https://www.nngroup.com/videos/bulk-actions-design-guidelines/
- NN/g, mobile tables guidance, 2025 (secondary): https://www.nngroup.com/videos/designing-tables-desktop-apps/
- Notion, Sharing and permissions, 2025: https://www.notion.com/help/sharing-and-permissions
- Google Drive Help, sharing and access (restricted vs link, roles, expiry), 2025 (secondary via search): https://support.google.com/a/users/answer/9310248
- OWASP, Authorization Cheat Sheet, 2025: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet
- OWASP, Insecure Direct Object Reference, 2025: https://owasp.org/www-community/attacks/insecure_direct_object_reference
- IETF, RFC 9110 HTTP Semantics (If-Match, 412), 2022 (secondary): https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/412
- Crockford Base32 (secondary implementations), 2019: https://www.pypi.org/project/base32-crockford
- Regulation (EU) 2016/679, Art. 5(1)(c) and Art. 17, 2016
