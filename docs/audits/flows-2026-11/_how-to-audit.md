# How a flow audit is run (method shared by every auditor)

You audit ONE flow of Café Sensible against (a) the expert bar in `docs/expertise/<domain>.md` and (b) the
code on this branch. Your output is one file `docs/audits/flows-2026-11/<nn>-<slug>.md` in the exact
shape of `_template.md`. Read, in this order, before writing anything:

1. `docs/expertise/<primary-domain>.md` — the bar. Then the two lenses every flow gets:
   `docs/expertise/cupping-protocol.md` (does the flow respect how cupping is actually done?) and
   `docs/expertise/offline-native.md` (§3 "Native-readiness" checklist and §5).
2. Your flow's section of `C:/projects/flowmap/boards/cata-cafe.spec.md` (the line range is in your brief).
   It is the as-is blueprint produced by an earlier code audit: goal, invariants, variants, happy path with
   file:function references, requirements already on the board, failure branches, open questions ⚑.
   Treat it as a MAP, not as truth: every claim you repeat must be re-read in the code.
3. The matching section of `docs/flows.md` (normative lifecycle diagrams) and the CLAUDE.md rules that
   touch your flow. Any fix you propose must respect these invariants or say explicitly which one it
   bends and why: one close routine (`lib/closeSession.ts`), closed = read-only (`assertSessionWritable`),
   authorization only through `lib/sessionAuth.ts`, scoring inputs never from the client, reference-sample
   rules (`lib/referenceRules.ts`), guest scope (`lib/guestScope.ts`), owner-only physical/extrinsic data,
   PDF gating inside the builder, offline store client-only, server-action `ActionResult` contract.
4. The code: start from the spec's "Files likely touched" list and the `path:line` references, then
   follow imports. Read the actual files with Read/Grep; do not assume from file names.

## Rules

- **Evidence or nothing.** Every finding cites `path/file.ts:line` that exists on this branch and quotes
  or paraphrases the line. A finding you could not pin to code goes to §5 "Not verified", not to §3.
- **Independent, then reconciled.** First decide what the bar demands; then check the code; only then
  look at the board's own requirements for that flow and mark each finding `new` or
  `confirms-board(<requirement title>)`. Do not restate board requirements without re-verifying them,
  and do not skip a gap just because the board already lists it: say so with `confirms-board`.
- **Problem → Implication → Fix**, in that order, in plain sentences a product owner can read. The Fix
  describes behaviour and acceptance checks, not code. Size it S/M/L.
- **Severity is about consequence, not effort.** P1 = data loss, security, a blocked flow, scoring
  correctness. P2 = wrong or lossy behaviour a user meets in a normal cupping. P3 = friction/polish.
  Expect few P1s. Do not inflate.
- **Native lens on every finding.** Say what the fix must also hold inside a Capacitor/WebView shell
  (storage, deep links, OAuth, file save/share, background resume, keyboard/viewport), or `n/a`.
- **Kim flag.** When the right behaviour depends on cupping practice (not on engineering), write the
  question in plain Spanish-friendly language with the options, flag `Kim? yes`, and repeat it in §6.
  Never ask Kim a technical question.
- **Keep list.** §4 names what works well and must not regress, with the implementing file.
- **Honest coverage.** §5 lists what you could not verify from code (needs a device, two users,
  production data, Kim) and the cheapest way to verify it.
- **No code changes.** You only write your audit file. Do not edit source, do not run the dev server,
  do not run migrations. `npm test`, `npx tsc --noEmit` and reading files are fine.
- Length: aim for 900–2 000 words. Prefer 6 sharp findings over 20 vague ones.
