# What we did after the Flowmap

Report for Ricardo, 2026-11-14. The editable version of this report, with the signed-in checks as tick boxes, is a private shared document: https://claude.ai/artifact/W3T1tY4sAbNEFrHKNKCKTo

All 157 problems the audit recorded on the Flowmap are closed (156 fixed, 1 rejected), through 76 merged pull requests, and everything planned is live in production. This report covers what was merged between 2026-11-10 and 2026-11-14 (series S8, S9 and S10).

In early November an independent audit walked through 18 flows of Café Sensible. Eleven of its findings were serious (P1). For example, a participant using the browser's developer tools could read other cuppers' scores before results were released. Closed sessions could still be written to, and guests could create sessions and send email from the app's domain. Unsent notes disappeared silently at close, and the stored score did not match the score on screen.

The work came in three series:
- **S8** fixed the audited flows.
- **S9** closed what an engineering audit of S8 found.
- **S10** built the decisions taken from Kim's answers.

The database protections are in production. The score follows one rule everywhere, and no stored score was recomputed in bulk. On the Flowmap, all 59 cards have every field filled and every fixed finding carries a note saying how it was fixed.

What is not known: the AI sessions never checked anything that needs a signed-in person or a real phone. Every production check was done from outside (the site answers, protected pages refuse strangers), plus read-only database queries. Kim's answers were simulated in his place, not given by Kim, so everything built on them stays provisional until he confirms.

Three things need you first:
- the signed-in smoke checks (section "What is not verified");
- the Registro Mercantil line on the published legal pages;
- the rehearsal and switch-on of the unused-account deletion before 2027-05-30, which the published privacy text promises.

The last pieces were finished overnight on 2026-11-14 while you slept: #138, #139 and #140, each merged only after an independent review said yes. Nothing needed a database change that night.

---

## The numbers

| Item | Number | Notes |
|---|---|---|
| Findings on the Flowmap | 157 | 18 flows audited on 2026-11-06 |
| By severity | 11 P1, 68 P2, 78 P3 | The auditors first rated 15 P1, 79 P2 and 63 P3. The verification pass lowered 19 of them (4 from P1 to P2, 15 from P2 to P3). |
| Fixed / rejected | 156 fixed, 1 rejected | The rejected one is a P2 (F-grupal-asincrona-6), rejected by the audit's own verifiers. |
| Open now | 0 | You parked some related items with a written reason (listed under "What waits on you"). |
| Flowmap cards | 59: 57 done, 2 owner to-dos | Every card has every field filled. Six fixed findings have no pull request number because none was recorded; their notes say so. |
| Engineering audit of the S8 code | 0 critical, 3 high, 13 medium, 21 low | All closed in S8 and S9 except one owner decision (three test accounts with a password, A-13). |
| Merged pull requests, all series | 76 (#65 to #140) | S8: 37 (29 with code, 8 documentation). S9: 13 (5 code, 8 documentation). S10: 26 (20 code, 6 documentation). The pull request that adds this report to the repository is not counted. |
| Commits on the main line | 49, of which 22 are documentation only | See the note below the table. |
| Database migrations (new columns or tables) | 15: 10 in S8, 0 in S9, 5 in S10 | All additive (new empty columns or tables). You ran each S10 one. |
| SQL phases applied in production | 9: PHASES 21, 22, 23 step 1, 24 (S8); 25 (S9); 27, 26, 28, 29 (S10) | Each after a dry run that undid itself, and after your explicit yes. PHASE 23 step 2 was cancelled. |
| Stored group scores recomputed in bulk | 0 of 354 | Confirmed by a read-only query after each S10 phase. |
| Automated tests at the start | 35 unit test files; no database tests | File count at the last commit before the range; the number of tests was not recorded. |
| Automated tests at the latest merge (#140) | 2,447 unit tests and 332 database tests | Reported by the builder and the reviewer on that pull request, not measured for this report. |
| Size of the change (#65 to #140) | 819 files; 88,359 lines added, 6,037 removed | Tests: 26,196 lines added. Documentation: 18,608 lines added. |

**Why "commits" and "pull requests" give different numbers.** You remembered "50 to 54". A pull request is one proposed change; a commit on the main line is one entry in the project's history. Most pull requests became one commit each. The 28 parts of S8, however, were built stacked on top of each other and merged all at once, so one commit (#95, on 2026-11-11) carries 28 pull requests. That is why the main line shows 49 commits but 76 merged pull requests.

Other production facts from the documents: 185 registered users and 315 anonymous guests (2026-11-11). There were 1,081 submitted evaluations with quality ratings, and 96% of them had fewer than five cups (2026-11-12).

---

## What changed, by theme

Each table reads "before → after" as a cupper, an organiser or you would see it, or as what could go wrong. Pull request numbers are in parentheses so the details can be found. Not every pull request is listed; these are the most consequential changes.

### 1. Blind tasting and privacy

| Before | After |
|---|---|
| A participant using the browser's developer tools could read every other cupper's submitted scores and the group score, through the app's public database key. | The public key can only read. A participant reads only their own evaluations, and group results only when the rules allow (PHASE 21, S8 #68). |
| Closed sessions could still be written to directly in the database, and membership was not checked when a row was written. | The public key cannot write to any table (PHASE 21 and PHASE 24, S8 #68, #90). |
| The print page sent the coffee name and roast of unrevealed samples to participants. The results page carried the organiser's green-coffee data. | The server decides what each person may see before anything is sent (S8 #67). |
| The cup page told participants which coffee each sample was, as an internal id. With a public coffee, a participant could open its page before the reveal. | Only the organiser receives it (S9 #107). The reviewer found this; it predated S9. |
| Sample letters followed the order in which the organiser typed the coffees. | Letters are assigned at random. The organiser reads the letter-to-coffee key in a collapsed "Clave de muestras". Roast date and preparation notes per sample are blind too (S10 #120). |
| In a group session, results became visible as soon as everyone had submitted. | Group results are visible only at close (S10 #123, PHASE 28). |
| After a sample was revealed in an open session, people could keep evaluating it while knowing what it was. | A revealed sample becomes read-only (S10 #133). |

Why this matters: the product's promise is independent blind scoring. Before these changes, anyone curious enough to open the browser's developer tools could break it. A revealed sample could also still be scored with its name in view.

### 2. The score

| Before | After |
|---|---|
| Three different calculations were live at once: the stored group score, the results-page score and a "live total" in the form. A 2-cup session stored 77.50 and showed 80.00. | One rule, written once, used everywhere (S10 #117, PHASE 26). The live total in the form is gone. The score appears after sending, with its arithmetic line, for example "92.25 − 4 (1 taza fenólica) − 2 (1 taza no uniforme) = 86.25" (S10 #127). |
| After S8 (#70), a defective cup cost nothing under five cups. With 96% of evaluations under five cups, defects almost never cost points. | A defective cup costs 4 and a non-uniform cup 2, at most 6 per cup, at any cup count. The cost is shared out only when more than five cups are pooled (S10 #117). Details are in "The score, explained once". |
| A defective cup was flagged with no record of what the defect was. | Each defective cup carries its type (moldy, phenolic, potato). Old flagged cups without a type still count, shown as "sin especificar" (S10 #127). |
| The server did not check rating values: a rating of 9999 produced a score of 100. | The server accepts only whole numbers from 1 to 9 (S8 #91). |
| A coffee's profile averaged the scores of each session. | The profile shows one "Puntaje Café Sensible (base CVA)", built from every cup of that coffee in closed and revealed cuppings. It is marked "indicativo" under five pooled cups and comes with a defect tally by type and by number of people who found it (S10 #132). |
| Scores carried colour bands and quality names (for example "Excelente"). | A number only. The anchors 79 and 100 are explained as text (S10 #133). |
| A cupper who could not judge one attribute had an incomplete evaluation that counted for nothing. | "No evaluado" per attribute: the evaluation has no total, but its other ratings feed the attribute averages. Also new: an optional timer and a second value "as it cooled" (S10 #137, PHASE 29). |

Why this matters: the number is what the product produces. It now means the same on every screen, and a defect costs the learner points as the CVA teaches. No past score was recomputed in bulk; the few deliberate exceptions are listed in "The score, explained once".

### 3. Starting, running and closing a cupping

| Before | After |
|---|---|
| At close, unsent notes on cuppers' devices were silently dropped, and the offline client showed them as saved (green). | The close dialog says how many cuppers still hold complete unsent notes. Those notes stay on the device with a notice (S8 #75). The organiser can later accept a late complete evaluation into the results, marked as received late (S10 #131). |
| The closing date meant midnight UTC at the start of the chosen day, so the nightly job closed sessions on the morning of that date. Later the date ignored time zones. | The closing date is the end of the organiser's day in their own time zone, including daylight-saving days in Santiago (S8 #75, #91). |
| After the closing date passed, a session stayed writable until the nightly job ran (around 06:00 UTC the next day). | Saving, sending and joining are refused the moment the date passes (S8 #68). A passed closing date can no longer be moved (S10 #123). |
| Solo and express cuppings closed only if every sample was submitted. A close that failed halfway could not be repaired. | A "Terminar cata" button. The close runs in two steps, and a nightly pass repairs one that failed halfway (S8 #75). |
| A forgotten live session stayed open forever. | For sessions started on or after 2026-11-18: the organiser is reminded after 24 hours, and the session closes by itself after 7 idle days with the usual emails, or without email once it has been idle 30 days. Older sessions get no reminder and close silently only after 30 idle days (S10 #123). |
| A live group session emailed the group at creation, before the cupping had really started. | It emails when the organiser presses "Iniciar cata", or at creation if the organiser chooses that (S8 #84, S10 #120). |
| There was no way to warn people that the close was coming. | The organiser can announce the close 2 or 5 minutes ahead, and cuppers see a countdown. The server does not enforce it: if the organiser's page is closed, nothing closes (S10 #131). |

Other details: the wizard now proposes 2 cups per sample (S8 had set 5). It warns above 6 samples (above 4 for the combined format) but sets no hard limit (S10 #120). The reference sample can be "fixed" (everyone's quality pinned at 79.00, the class exercise) or "free" (scored like any other sample) (S10 #120). The fixed reference exists only where quality is rated: a descriptive session never says "fija" or 79.00 (S10 #138, #139).

Why this matters: closing is when results become final and emails go out. Before, work could vanish without anyone knowing, and sessions could stay open indefinitely.

### 4. Guests and shared devices

| Before | After |
|---|---|
| Anonymous guests who joined by QR code could create sessions and groups and send email from the app's domain. | Guests can join, evaluate and see results. Creating and sending are for registered accounts only (S8 #69). |
| On a shared tablet, the join page silently continued as the previous guest. | The page asks "¿Eres {nombre}?". "No soy {nombre}" signs that guest out and keeps their unsent notes on the device (S10 #116, five review rounds). |
| An old browser tab left open after the person at the device changed could save as the wrong person. | Every save carries the person the page was opened for. If a different person is signed in, the save is refused before anything is written and a notice appears (S10 #116, #126). |
| A guest who finished turning into an account in another tab could leave the first tab's edits stranded under the old guest identity. | The first tab moves the notes over and reloads (S10 #126). |
| Turning a guest into an account could fail with "ya vinculado" and no way out. | A retry card, plus "Usar otra cuenta" and "No vincular" (S8 #73). |

Why this matters: venues use one tablet and QR codes. Both writes under the wrong identity and spam from the app's domain were possible.

### 5. Working offline

| Before | After |
|---|---|
| Notes saved on the device for a closed or deleted session looked synced. | Each note has a clear state (pending, synced, conflict, failed, closed unsent, orphaned). A "N notas sin sincronizar" panel lets the person read, copy or deliberately discard them. Nothing is deleted automatically (S8 #80). |
| An old offline note replayed later could overwrite a newer save. | The server ignores a write older than what it already holds (S8 #83). |
| Signing out, or turning a guest into an account, could lose notes kept only on the device. | A warning comes first (S8 #80). |
| A tab left open across a new release failed every save without saying why. | A lasting "new version, reload" notice appears, and the notes stay on the device (S9 #102, S10 #119). |
| A phone waking from sleep could keep a dead live connection. | On wake, the page rebuilds its connection and refreshes once (S8 #76, S10 #119). |

Why this matters: cuppings happen in labs and venues with poor signal. Trust depends on "my notes are never silently lost".

### 6. Results, reports and exports

| Before | After |
|---|---|
| Tied scores got different ranks, and group numbers did not say how many cuppers were behind them. | Ties share a rank, and "n de N incluidos" appears everywhere. Results with 3 to 5 cuppers are marked "indicativo". "Sin diferencia clara" appears when samples are closer than the larger of 1 point and half the spread (S8 #74, S10 #136). |
| Excluding a cupper from the results asked for no reason and left no trace. | A fixed list of reasons (no health reason; it is worded "no estaba en condiciones de catar"). The app records who excluded whom and when, and shows a private notice to the excluded cupper on their own results page (S8 #74, S10 #128). |
| PDFs had no date or language stamp, and the organiser had no export. | Every PDF carries a generation stamp. The organiser has a CSV, also in a version without names that uses a code per cupper (S8 #74, S10 #128). |
| Marking a sample as the fixed reference overwrote the cuppers' own ratings of it. | Their ratings are kept and come back if it stops being the reference (S10 #136). |
| A cupper could not compare themselves with the group. | "Tú y el grupo" on a closed group session, shown only when at least 3 cuppers stand behind each row. Also a comparison for a sample served twice (S10 #136). |
| A cupper could not add anything after close. | A text note on one's own evaluation after close. It never changes a rating (S10 #131). |

Why this matters: teachers and cuppers act on results. Honest counts stop people over-reading a group of two, and the privacy limits keep one cupper's numbers from being worked out by another.

### 7. Coffee profiles

| Before | After |
|---|---|
| A coffee's profile also averaged open blind sessions, and showed other organisers' session names and private notes. | Only closed and revealed cuppings count. Session names appear only for sessions the viewer owns or joined, and notes are for the owner only (S8 #67). |
| Deleting a session with an unrevealed sample either removed the cupper's history for it or copied the coffee's name into their history. | A history row with the label only ("Café sin revelar"). Express samples without a coffee also get one (S8 #85). |
| Shared coffee links never expired. | They expire after 30 days and can be renewed or revoked (S8 #74). |
| The cup page had no way to link a sample to a coffee already in the system. | "Usar café existente" in the sample editor (S9 #107). |
| Editing origin data after close left no visible trace. | "Datos de origen editados el …" appears. It is based on a field that changes only when origin data is edited (S10 #128). |

Why this matters: many people see a coffee's profile across sessions. It must not reveal a blind cupping, and its number is now the coffee's long-term record.

### 8. Groups and email

| Before | After |
|---|---|
| Group email had no limits and no record of who received what. | There are now limits per hour and per day: 3 broadcasts per hour and 300 recipients per day, or 40 per day for accounts less than a day old. Sign-in links are limited per address, per network and per account. Each recipient gets a delivery record, and only failed recipients are retried (S8 #69, #95). |
| Ten requests arriving at the same moment could pass a limit of 3 (6 got through). | The limit holds under simultaneous requests (S9 #108; found by the new database tests). |
| There was no way to unsubscribe from a group's email. | Every group email has an unsubscribe link and one-click unsubscribe. The person's choice is respected before any limit is counted (S8 #86). |
| Group members could see each other's email addresses, partly through the default display name. | Members see names only, and only the group owner sees addresses (S10 #128). See the open decision on the default name below. |
| Invitation links carried the recipient's email address, and a refused link still created a guest account. | Addresses are removed from links. Closed, used-up, revoked and locked links each get their own message. The organiser can close entries to newcomers (S8 #79, #81). |

Why this matters: email comes from the product's own domain. A spam or bounce problem would damage the real cuppings that depend on the same sending quota.

### 9. Accounts, sign-in and legal

| Before | After |
|---|---|
| Opening the email sign-in link signed in immediately, so an email scanner could use it up. The link also lost the page the person wanted. | The link opens a page with an "Entrar" button, the email also carries a 6-digit code, and the original destination is kept (S8 #71). |
| A sign-in link opened in a browser that had not requested it signed that browser in. | The same browser signs in directly. Any other browser first shows "Vas a entrar como <address>" with "Sí, continuar" / "No soy yo" (S9 #104). |
| There was no way to sign out of all devices, change email or delete an account. | "Salir en todos los dispositivos" and "Cambiar correo" exist (S8 #73). Account deletion is built, but its switch is OFF and it has never run against any database (S8 #87, #91). |
| There was no privacy policy, no terms and no legal notice. | Three pages in Spanish and English, adapted from your documents and published on 2026-11-13 after you read them. The Registro Mercantil line is missing by your decision (S10 #118, #134). |
| Accounts that were requested but never used piled up with no end date. | A nightly job deletes accounts never used after 12 months. Its switch is OFF. 30 such accounts exist, and the oldest reaches 12 months on 2027-05-30 (S10 #118, #130). |

Why this matters: legal exposure, app-store requirements, and a promise now made in writing on the published privacy page.

An incident worth knowing about: right after the S8 release (2026-11-11), Google and email sign-in both failed in production. The site address in Vercel was set with "http", and S8 had started using it as the sign-in return address. You reported the failure, and the fix (#98) was live about 45 minutes after its merge. Neither the audit nor the tests could see a production setting. The signed-in check that would have caught it was listed as owed but was not run before the merge.

### 10. The warm-up "Movimiento Sensorial"

| Before | After |
|---|---|
| After "Iniciar cata", participants of a live group session still got the warm-up on the cup page. | Once the cupping has started, they do not (S8 #78). |
| After a phone lock the player could stall without saying so. | It pauses and asks "Toca para reanudar" (S8 #78). |
| Reflections were first saved only in the browser, then not saved at all. | They are saved privately in the person's account, and nobody else can read them, admins included (S10 #122, PHASE 27). |
| One length only, standing only. | New additions (S10 #122): a short version of about 1.5 to 2 minutes; "Sentado" and "Poco espacio" options; a small entry button on the cup page after the interstitial; "Calentar 1–2 min antes" in "Catar ahora". |
| The copy promised sharper senses. | It no longer does (S8 #78). |

Why this matters: the warm-up is what sets the product apart, and a player that stalls at the start of a cupping wastes everyone's time.

### 11. Admin and insights

| Before | After |
|---|---|
| Any user with the insights flag could see every cupper's name and scores across the whole platform. | Only the super-admin sees the whole platform; everyone else sees only their own data. Cuppers appear as "Catador XXXX", and those with fewer than 3 evaluations are left out (S8 #77). |
| The super-admin's address was written into the code. | It is a required setting, and production refuses to start without one valid address (S10 #119). |
| AI admins saw raw email addresses, and exports and access grants left no trace. | Addresses are masked on the server, and exports and grants are written to an audit log (S8 #77). |
| The monthly digest could send twice or not at all. | It claims its month before sending (S8 #81). |

Why this matters: other organisers' blind tastings must stay private, even from people with admin access.

### 12. Reliability under the hood

| Before | After |
|---|---|
| The web framework (Next.js) had published security warnings: 19, one of them critical. | It was upgraded. 7 warnings remain, none critical, all from the database tool's chain (S8 #92). |
| Since August, two database rules referred to each other, so any read of coffees through the public key failed. The app was unaffected because it uses a different access route. | Fixed (S8 #93). The dry run of PHASE 24 found it. |
| No tests ran against a real database. | A suite that runs on a throwaway local database (S9 #108). It found the email-limit race on its first run and grew from 54 to more than 300 tests. |
| A collision of the 6-character coffee codes was never retried anywhere. | Fixed (S9 #106). A reviewer found it. |
| When the organiser marked a reference and a cupper pressed "Enviar" at the same moment, each could block the other (a deadlock). | Locks are always taken in one fixed order. A save that has to wait more than 5 seconds answers "busy, try again" instead of hanging, and never leaves half an edit (S10 #136, #138, #139). |

Why this matters: these failures show up only under real load at a real cupping, which is the worst moment to find them.

---

## The score, explained once

**The rule in words.** A cupper rates eight quality attributes from 1 to 9, which give a base score the same way the CVA does (all 5s give 79, all 9s give 100). Cups the cupper flags then cost points: 4 for a defective cup and 2 for a non-uniform cup. With 2 or more cups, a defective cup is also non-uniform, so it costs 6, and no cup ever costs more than 6. With a single cup there is no uniformity, so a defective cup costs 4. When more than five cups are pooled, the cost is shared out: it is multiplied by 5 divided by the number of cups.

**Three scopes, one formula.** Only the cups counted change.

| Scope | Cups counted | Where you see it | When it can change |
|---|---|---|---|
| My score | my cups of that sample (never more than 5) | my results | never after sending |
| The session's score | all included cuppers' cups of that sample | the group results | never after close |
| The coffee's lifetime score | every cup of that coffee in closed, revealed cuppings | the coffee profile | each time a cupping of that coffee closes |

**Worked example.** One defective cup, same coffee:

| Situation | Cups pooled | Cost |
|---|---|---|
| I cup alone with 2 cups, 1 defective | 2 | −6 on my score (4 for defective + 2 for non-uniform) |
| The same cup in a group session where 4 people cup 2 cups each | 8 | I still see −6; the session's score shows −3.75 (6 × 5 ÷ 8) |
| The coffee's profile after 40 cups have been cupped across sessions | 40 | −0.75 on the coffee's lifetime score (6 × 5 ÷ 40) |

My session keeps showing −6. Only the coffee's profile moves as more people cup it.

**What was wrong before.** Three calculations were live at the same time:
- **The stored group score** deducted at any cup count, but it amplified the cost when few cups were pooled: one defective cup out of 2 cost 20 points. It also counted a defective cup twice: 8 points for 1 cup out of 5, where the CVA says 6.
- **The results page** deducted only from five cups up.
- **The form** showed a third "live total" that always deducted.

S8 (#70) closed the gap by removing deductions below five cups on both sides. You reversed that on 2026-11-12: with 96% of evaluations under five cups, a defect almost never cost anything. A purely proportional rule was written the same day and rejected, because one bad cup could cost 15 to 20 points. The rule above is the one you approved. It is framed as a return to the principle before S8, with three bugs fixed, plus one new thing: the coffee's lifetime score.

**The promise kept: nothing stored was recomputed in bulk.** The 354 stored group scores were not recomputed; a read-only query confirmed this after each S10 database phase. The data records which rule produced each number, so old results still display as they did. The planned recompute of past scores (PHASE 23 step 2) was cancelled and never ran.

This means some old numbers stay as the old rule left them. 25 stored session scores are lower than the new rule would give, because the old calculation over-deducted by up to 14 points; one 2-cup sample stores 0. 54 stored individual scores under five cups carry no deduction.

Exceptions you should know about, all deliberate:
- A past sample is recomputed under the new rule if you deliberately exclude or re-include a cupper, or accept a late evaluation for it.
- The same happens if a guest turning into an account removes or replaces a submitted evaluation of that sample.
- Editing an old evaluation moves that evaluation to the new rule.
- A draft saved before the change and sent after it is scored under the new rule.

---

## What is not verified

Every merge was followed by a check from outside: the deploy succeeded, the health endpoint answered, public pages answered, and protected endpoints refused unsigned requests. Every SQL phase was followed by a separate read-only database query. Nobody has checked anything below yet.

**A cupper on a phone**
- Marking a defective cup asks for its type. A 2-cup session with one defective cup shows −6 and the arithmetic line on results.
- The cup grid with one cup; using the defect chooser with the keyboard.
- Working offline: notes saved on the device, the "N notas sin sincronizar" panel, sending after reconnecting.
- The warm-up: the lock screen and "Toca para reanudar", the short version, "Sentado" / "Poco espacio", saving a reflection.
- "No evaluado" on one attribute, the timer, the "as it cooled" value.
- Typing the 6-digit sign-in code; signing up with a new address; changing email.
- A sample revealed while the session is open becomes read-only.

**An organiser with two devices (or two accounts)**
- A participant cannot see other cuppers' scores while the session is open (needs a second account).
- Group results seen as participant and as organiser of an open group session; "Cerrar ahora" after the date.
- Live updates between two devices during a group cupping.
- Two people on one tablet: "¿Eres {nombre}?", "No soy {nombre}", then typing in the old tab.
- A guest turning into an account in a second tab.
- Announcing a close 2 or 5 minutes ahead; accepting a late evaluation; a note after close.
- The new session wizard: random letters, "Clave de muestras", per-sample prep data, fixed versus free reference.
- A sign-in link opened on a second device shows the "Vas a entrar como" card.

**You as owner and admin**
- An old closed session shows unchanged numbers.
- The coffee profile's new score card.
- Super-admin pages and the insights views.
- The results CSV, with and without names. Anything that imported the old column name `puntaje_cva`, which is now `puntaje_cafe_sensible`.
- The published legal links in the footer and on the login page.
- A solo cupping closed from the cup page with "Cerrar la cata".
- Account deletion has never run against any database. Its switch stays off until it is rehearsed on a throwaway account outside production.

---

## What waits on you

1. **Signed-in smoke checks** from the list above. Start with the scoring line, the wizard, and group results as participant and as organiser.
2. **The Registro Mercantil line** on the legal notice. It is mandatory for an S.L.; the pages were published without it by your decision on 2026-11-13.
3. **Unused-account deletion before 2027-05-30.** The published privacy text promises that never-used accounts are deleted after 12 months. The job exists but its switch is off. It needs a rehearsal (runbook section 17, item 4), then the switch turned on in Vercel before the oldest such account reaches 12 months.
4. **The default display name.** A person who never set a name appears under the first part of their email address. Co-cuppers see it in the waiting room, the organiser's score matrix, the group feed, the owner line on the group page, alignment panels, the owner's CSV, coffee history and the users directory. Group rosters were fixed; the default itself was not changed. Decide whether it should become a neutral word such as "Catador".
5. **Paste the email-change template** in Supabase (runbook section 15).
6. **Founding-offer conditions**, the wording of data-transfer safeguards for Vercel and Resend, and the contact address on the legal pages.
7. **Confirm decisions you were told about and have not objected to:**
   - an old flagged cup with no defect type still counts ("sin especificar");
   - a guest turning into an account recomputes a sample only when it removes a submitted evaluation;
   - sessions started before 2026-11-18 are never emailed by the idle rule;
   - "no estaba en condiciones de catar" is used instead of a health reason.
8. **Numbers chosen by the AI that you may change**: 300 email recipients per day, 40 per day for new accounts, 10 sign-in links per account per 15 minutes, 3 resends of close emails per hour, and 5 seconds of waiting before a save answers "busy, try again".
9. **Housekeeping**:
   - three test accounts with a password in the repository (A-13);
   - the database cleanup of test sessions and empty guests (specified, not started);
   - test sessions named "[TEST S8]" / "[TEST S9] … borrar" on your test account;
   - a coordinated upgrade of the database tool to clear the last 7 security warnings.
10. **Vercel sign-in in the browser pane** has expired, so protected preview deployments could not be opened. Sign in again if a preview must be checked.
11. **Two owner to-do cards on the Flowmap** got a proposed due date of 2026-11-30 from the AI. Change them if that does not suit you.

Found on the last night, for you to decide:
- The monthly digest's record keeps the super-admin's address in clear, as the key of each outcome. Every other email record holds only hashes or ids. No code was changed.
- A note replayed in the background while a session is busy stays on the device and is retried at the next trigger (reconnect, reopening the page, a new save), not on a timer.
- In a descriptive session, the reference now takes part in the "same coffee served twice" comparison, because nothing is pinned there.

Parked by you with a reason (these are not open findings): the teacher's guide (B4), optional email at join (E2), group member consent, the accessibility statement, a stricter cookie prefix, and making old migrations replayable on an empty database.

## What waits on Kim

1. **Confirm the simulated answers.** Every piece of code built on one carries a marker with the answer's code. Examples: A2 cups default, A4 random letters, A9 sample prep data, B1 reference mode, C3 idle close, C5 results only at close, C8 notice timing, F1 to F5 warm-up. The full list, with the question to ask him for each, is in the repository at `docs/product/kim-validar-S10.md`.
2. **The score rule itself (A1):** flat CVA costs at any cup count, shared out above five pooled cups. You decided it; Kim has not validated it.
3. **Open questions raised while building:**
   - The short warm-up with eyes open has no sound marking its end. Should a single tic mark it? (#122)
   - Should the score line for one defective cup read "− 4 … − 2 …", or be worded differently? (#127)
   - On the coffee lifetime score: should the radar and attribute averages also leave out fixed-reference 5s and quick impressions? Should the defect tally need a minimum number of people? Should earlier references be left out? (#132)
   - "alineación" instead of "calibración". (#138)
   - A first-person line attributed to Kim on the warm-up page shipped on your "ship now"; it needs his yes or a reword.
   - His simulated answer on small groups reads "from 3 cuppers indicative, and up to 6"; the code treats 3 to 5 as indicative and 6 as firm.
4. **His 20-person class (RCS).** If nobody evaluates in it before then, the idle rule closes it silently around 2026-12-06, without email.

---

## How the process worked

1. **Audit** (2026-11-06): nine research briefs (cupping practice, sign-in, offline, reporting and so on), reusable auditor agents, and 18 flow audits. Seven verifiers marked each finding confirmed, plausible or rejected. It took about 36 agents and three hours.
2. **Flowmap**: findings and work cards on the published board, each finding linked to its flow.
3. **Specs and briefs**: S8 had 15 written prompts, later 28 parts. S10 had one brief per work package, plus a common rules file every builder read.
4. **Builder**: an agent built each package in its own copy of the code and opened a draft pull request.
5. **Independent reviewer**: a separate, stronger agent was told to attack the change and answer "would you merge this as is?". It had to prove its claims by deliberately breaking the code (mutations) and by probes.
6. **Fix rounds**: the same builder fixed what the reviewer found. A new review followed when the fix was larger than asked.
7. **Merge** only on a "yes" with green automatic checks (your standing rule from 2026-11-12).
8. **Production check from outside** after every merge, then a Flowmap update: finding marked fixed with the pull request number, card closed.
9. **Database changes**: you ran the migrations. Each SQL phase first ran as a dry run that undid itself and was shown to you. It was applied only on your explicit yes and then confirmed by a read-only query.

---

## What we learned, and how to improve the process

### What worked

- **Independent review caught real defects every time.**
  - In S8 the review found a real defect in every pull request. Three of them would have lost data; for example, "Terminar cata" deleted samples that held green-coffee data.
  - In S10 every review found something. The guest work needed five rounds, the legal work five, the closing rules four and the scoring core four.
  - Several of these would have reached users. An email change could have moved another person's reservation. The first idle-close run would have emailed Kim's 20-person class about a months-old session.
- **Dry run, then your yes, then a read-only check.** Nine SQL phases reached production this way with no failed apply. The dry runs also found problems nobody had looked for: two database rules that had blocked every read of coffees through the public key since August.
- **Tests against a real database** (added in S9) found a race on their first run: 6 of 10 simultaneous requests passed a limit of 3.
- **Data before decisions.** The scoring reversal came from a production count (96% of evaluations under five cups). The idle-close rule was shaped by a dry run that listed exactly which sessions it would touch and who would be emailed.
- **Written state.** Handover files, decision tables and the Flowmap let work resume after four usage-limit stops without asking you again for decisions already taken.

### What went wrong or cost time

- **My own briefs caused several "no" verdicts, not the builders.**
  - #127: the brief said a defective cup without a type should not count. This silently raised an old evaluation from 77.5 to 83.5 when someone touched its cup grid.
  - #118: the legal brief promised a 12-month deletion that the code, as briefed, could never carry out.
  - #131 (two "no" verdicts): the first brief let the organiser accept a late evaluation without seeing its content. The correction then refused a late send in the most common case, an incomplete draft already on the server.
  - #132: empty evaluations were allowed to dilute a coffee's defects.
- **Privacy that only looked private.** The first "CSV without names" could be re-identified, because its rows were in name order and the first code was the organiser (#128).
- **A fix created a new bug.** The fix for the reference ratings introduced a deadlock between the organiser and a cupper pressing "Enviar". Only the reviewer's concurrency test found it (#136, third round).
- **Earlier design errors on sign-in.** In S9 my design for cross-device sign-in was wrong twice in one day. A masked address could be imitated by a similar-looking one, and the session existed before the question was asked.
- **Parallel work on the same files.** Packages built at the same time touched the same files (results page, offline saving, message files, the runbook). This caused repeated merge conflicts and extra review rounds; #131 had to be re-merged and re-reviewed after #136 landed. One merge carried leftover conflict markers.
- **A direction reversed after it shipped.** S8 resolved the two disagreeing scores by removing deductions under five cups, and you reversed it a day later. The audit had not asked which number matched the product's purpose.
- **A production incident nobody could see from the code.** Sign-in broke after the S8 release because of an "http" address in Vercel's settings. The signed-in check that would have caught it was owed and not run.
- **Machine and usage limits.** At most four agents could run; five starved the machine (tests took 25 minutes, installs never finished). The work stopped four times on the 5-hour usage limit. Pushing to many branches used up Vercel's 100 deployments per day on 2026-11-10.
- **Agents misbehaving.**
  - Sub-agents sometimes paused waiting on their own background work, or ended without a report.
  - One builder killed every local test-database process on the machine, interrupting other builders.
  - Another rebuilt an action that already existed in the same file.
  - The agent that drafted this report could not save its file, and the draft had to be recovered from the session's transcript.
- **Nothing signed-in was ever checked.** All verification was from outside. The browser's Vercel sign-in expired, so one protected preview could not be opened.
- **Kim's answers are simulated.** Everything built on them may need rework when he answers.
- **A quote attributed to a real person shipped without his approval.** The warm-up page carries a first-person line attributed to Kim. The reviewer recommended leaving it out; you chose to ship it now. It needs his yes or a reword.
- **The overnight run (2026-11-14).** You asked for the rest to be finished without you. It worked, with limits. Three pull requests were reviewed and merged (#138, #139, #140), and none needed a migration or a SQL phase. The second review of #138 found a false sentence that was already live (descriptive sessions claiming a pinned 79.00); it became #139 the same night. The review of the documentation pass found four false sentences in the summaries, two of which were also in the first draft of this report. Nothing that night was checked by a signed-in person either.

### What I would change next time

1. **Have the reviewer attack the brief before any code is written.** A short review of the rule itself ("what breaks if this rule is true?") would have caught four problems that each cost a full build-and-fix round: the untyped-defect rule (#127), the blind acceptance and incomplete-draft rules (#131), the empty-evaluation dilution (#132) and the 12-month promise (#118).
2. **Plan work by file ownership.** Before launching packages in parallel, list the files each will touch; packages that share files run one after another. This would have removed most of the merge conflicts and the re-review of #131 after #136.
3. **Write down the invariants and the lock order before building.** Give every builder and reviewer a one-page list, for example "no stored score changes", "a flagged cup always counts", "lock the session row first". The #136 deadlock came from two paths taking locks in different orders.
4. **Give every reviewer a standard checklist:**
   - every place that writes the same data;
   - what each kind of viewer receives in the page payload;
   - mutations that must be caught;
   - what happens when two people act at once;
   - whether "anonymous" output can be re-identified (row order, first row).

   This would have caught the CSV row order (#128) and the re-pinning of a revealed sample as the reference (#133) on the first pass.
5. **A preview environment with its own database.** Today previews point at production data and sign-in links always lead to production, so nothing can be clicked safely and no signed-in check can be automated. A separate database would let the AI run the signed-in checks itself, and would have caught the sign-in incident before release.
6. **A standing signed-in smoke checklist after each batch.** Ten minutes, run by you, or automated once item 5 exists. It would have caught the S8 sign-in failure before users did.
7. **Real answers from the domain expert before building on them.** Ask Kim a short list of the questions that change behaviour (score rule, reference modes, close timing), wait for those, and build the rest meanwhile. This avoids rework on simulated answers and reversals like the S8 scoring change.
8. **When two numbers disagree, ask which one matches the product's purpose and look at production data before "fixing" toward the standard.** This would have prevented the S8 scoring change and its reversal a day later.
9. **Smaller pull requests.** The largest packages needed four or five review rounds; smaller ones were reviewed faster and with fewer surprises.
10. **Plan around usage windows and machine limits:**
    - size each day's work to fit the window;
    - keep at most four agents;
    - have agents push once at the end (Vercel limit);
    - write the handover before 90% of the window;
    - give every agent the rules learned here: never kill processes by name, check whether something already exists, verify the merge result.

---

## Glossary

- **Finding**: one problem recorded by the audit, with its flow, its consequence and a proposed fix.
- **P1 / P2 / P3**: the severity of a finding. P1 is serious (data leak, data loss, wrong score), P2 should be fixed, P3 is minor.
- **Pull request**: one proposed change to the code, reviewed before it is accepted.
- **Merge**: accepting a pull request into the main version of the code, which is then deployed to production.
- **Commit**: one recorded entry in the code's history. One merge can carry many pull requests.
- **Migration**: a database change made through the app's database tool; here always adding empty columns or tables. You ran the S10 ones.
- **SQL phase**: a numbered block of database rules (who may read or write what, and the scoring function), applied by hand in Supabase.
- **Dry run**: running a SQL phase in a way that undoes itself at the end, to see exactly what it would do before applying it.
- **Trigger**: a function inside the database that runs by itself when data changes. Here it computes the stored group score when an evaluation is sent.
- **Fixed reference (anchor)**: a reference sample whose quality ratings are pinned at 5, so everyone's reference score is 79.00 and the other samples are compared with it. The alternative is a free reference, scored like any other sample.
- **Partial evaluation**: an evaluation in which the cupper marked one or more attributes "no evaluado". It has no total, but its other ratings feed the attribute averages.
- **Blind**: the cuppers do not know which coffee each sample is until the organiser reveals it.
- **Deadlock**: two actions each waiting for something the other holds, so both stop. The database cancels one of them with an error.
- **Preview**: a temporary copy of the site built for one pull request, used to check it before merging.
- **Simulated answers**: answers to Kim's questionnaire written in his place, not by Kim himself, still to be confirmed by him.
