# Expertise briefs

One file per domain. Each brief is the distilled "how this kind of flow should work" knowledge that an
auditor (human or agent) reads **before** looking at our code, so the audit measures the app against a
real bar instead of against itself. They were researched 2026-11-06 for the independent flows audit
(`docs/audits/flows-2026-11/`) and are meant to be reused: a new feature in a domain starts by reading
its brief; a future audit starts by refreshing it.

| Brief | Flows it serves | Paired agent |
|---|---|---|
| `auth-identity.md` | Entrar · Cuenta · Invitado QR y reclamar | `.claude/agents/flow-auditor-auth-identity.md` |
| `session-setup.md` | Empezar una cata · Catar ahora · Crear sesión | `flow-auditor-session-setup` |
| `live-collab.md` | Sesión solo · grupal en vivo · grupal asíncrona | `flow-auditor-live-collab` |
| `cupping-protocol.md` | lens on every session/results flow; source of Kim's questions | `flow-auditor-cupping-protocol` |
| `results-reporting.md` | Resultados · Informes y PDFs | `flow-auditor-results-reporting` |
| `asset-admin.md` | Editar y administrar · Cafés · Grupos | `flow-auditor-asset-admin` |
| `offline-native.md` | Offline y sincronización + native-app lens on everything | `flow-auditor-offline-native` |
| `guided-experience.md` | Movimiento Sensorial | `flow-auditor-guided-experience` |
| `growth-admin.md` | Landing · Insights y administración | `flow-auditor-growth-admin` |

## Shape of a brief

1. **Scope** — what the domain covers and what it deliberately leaves to another brief.
2. **Principles** — numbered, each with a one-line rationale and a source (link + year). These are the bar.
3. **Audit checklist** — yes/no questions a code auditor can answer by reading the code. Each maps to a principle.
4. **Anti-patterns** — things that look fine and are not, with the failure they cause.
5. **Native-app considerations** — what changes when the same flow runs inside a Capacitor/WebView shell on iOS/Android.
6. **Vocabulary** — domain terms the audit should use consistently (Spanish term · English term · meaning).
7. **Open practice questions** (`cupping-protocol` only, optional elsewhere) — things a platform cannot decide alone; seeds for the product owner / Kim.
8. **Sources** — the list, newest first.

## Refreshing a brief

Re-run the research prompt in `docs/audits/flows-2026-11/00-REPORT.md` §"How the briefs were made" with the
current date, diff against the existing file, keep what still holds, and bump the `researched:` date in
the front matter. Briefs are opinionated summaries, not standards: when a brief and the SCA protocol or
CLAUDE.md disagree, the protocol / CLAUDE.md win and the brief gets corrected.
