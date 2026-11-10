# <NN> · <Flow title as in the spec>

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines <a>–<b> · **Domain briefs applied:** `<primary>` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** <agent/model> · **Verification:** pending | done <date>

## 1. The flow in five lines (as-is, from the code)

What the user is trying to do, where it starts, where it ends, who is involved, what the code actually
does today. Written from the code, not copied from the spec. If the spec and the code disagree, say so here.

## 2. Expert bar applied

Three to six principles from the brief(s) that matter most for this flow, each with the checklist
questions it generated. This is what the flow was measured against.

## 3. Findings

Order: P1 first. IDs are `F-<flow-slug>-<n>`. Severity rule: **P1** = data loss, security, a blocked flow
or scoring correctness; **P2** = wrong or lossy behaviour a user hits in a normal cupping; **P3** =
friction/polish. `status` is `new` (not on the board) or `confirms-board(<board requirement title>)`.

### F-<slug>-1 · <title> · severity: P1 | P2 | P3 · status: new | confirms-board(<title>)

- **Problem** — what happens and where (`path/file.ts:line`), with the evidence: a quoted line of code or
  an observed behaviour. One paragraph, no speculation.
- **Implication** — who is hurt, how often, and which of: data loss · security · trust · robustness ·
  native-readiness · scoring. Say what a cupper or a teacher experiences.
- **Fix** — what must change, described as behaviour (not as code), then **Acceptance:** two to five
  testable checks. **Size:** S (≤½ day) · M (1–2 days) · L (≥3 days / needs a spec).
- **Native** — what the fix must also hold inside a Capacitor/WebView shell (storage, deep links, OAuth,
  file save/share, background resume), or `n/a`.
- **Confidence** — `verified-in-code` · `inferred-from-spec` · `needs-runtime-check` (say what to run).
- **Kim?** — `no`, or `yes` followed by the question in plain coffee language (no code words), with the
  options we see. These are collected into `docs/product/kim-flows-2026-11/01-preguntas-para-kim.md`.
- **Invariant check** — `none touched`, or the CLAUDE.md rule this fix brushes against (closed = read-only,
  one close routine, authz through `lib/sessionAuth.ts`, scoring never from the client, reference rules,
  guest scope, PDF gating) and why the fix still respects it.

### F-<slug>-2 · …

## 4. Keep — works well

Bullet list of behaviours the audit confirms are right and that no S8 prompt may regress (with the
file that implements them). Prompts cite this list as "do not touch".

## 5. Not verified

What the auditor could not establish from the code alone (needs a device, a second user, production
data, Kim). One line each, with the cheapest way to verify.

## 6. Questions for Kim (collected)

Repeat every `Kim? yes` question here, numbered `K-<slug>-<n>`, in plain language, with the options.
Empty section if none.

## 7. Verification log

Filled by the verification pass: `F-… CONFIRMED | PLAUSIBLE | REJECTED — reason` and cross-flow
duplicates (`same as F-other-3`). Rejected findings stay in §3, struck through, with the reason.
