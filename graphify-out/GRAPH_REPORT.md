# Graph Report - .  (2026-04-22)

## Corpus Check
- 69 files · ~65,732 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 188 nodes · 254 edges · 21 communities detected
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `Tech Stack` - 14 edges
2. `Project Directory Structure` - 14 edges
3. `prisma/schema.prisma` - 9 edges
4. `components/cupping/ Directory` - 8 edges
5. `requireUser()` - 5 edges
6. `Cata Café Project` - 5 edges
7. `Next.js 16.2.4` - 5 edges
8. `DB Model: SessionSample` - 4 edges
9. `DefectRowView()` - 3 edges
10. `calcAffectiveSum()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Next.js Breaking Changes Warning` --conceptually_related_to--> `Next.js 16.2.4`  [INFERRED]
  AGENTS.md → CLAUDE.md
- `Next.js Project (bootstrapped)` --references--> `Next.js 16.2.4`  [INFERRED]
  README.md → CLAUDE.md

## Hyperedges (group relationships)
- **Cupping Evaluation Form Components** — claude_cup_client, claude_combined_form, claude_descriptive_form, claude_affective_form, claude_physical_eval_form, claude_extrinsic_form, claude_flavor_tree_selector [EXTRACTED 0.95]
- **SessionSample Cascade Delete Group** — claude_db_model_session_sample, claude_db_model_evaluation, claude_db_model_physical_evaluation, claude_db_model_extrinsic_data [EXTRACTED 1.00]
- **SCA CVA Evaluation Formats (Descriptive, Affective, Combined)** — claude_sca_cva_methodology, claude_descriptive_form, claude_affective_form, claude_combined_form [EXTRACTED 0.90]
- **i18n Language Files** — claude_i18n_routing, claude_messages_es, claude_messages_en [EXTRACTED 0.95]

## Communities

### Community 0 - "Evaluation Form Utilities"
Cohesion: 0.07
Nodes (0): 

### Community 1 - "Project Architecture & Docs"
Cohesion: 0.07
Nodes (37): AFFECTIVE_ATTRIBUTES Constant, app/actions/ Server Actions, app/[locale] Route Structure, Auth Pattern (requireUser + magic link), Cata Café Project, Custom Color Tokens (CSS globals), Environment Variables (.env.local), FLAVOR_TREE Constant (+29 more)

### Community 2 - "Prisma Client Internals"
Cohesion: 0.22
Nodes (0): 

### Community 3 - "Page Components & Routing"
Cohesion: 0.14
Nodes (3): calcAffectiveSum(), calcIndividualScore(), calcRawScore()

### Community 4 - "Auth & Layout Guards"
Cohesion: 0.17
Nodes (0): 

### Community 5 - "Cupping Form Orchestration"
Cohesion: 0.18
Nodes (11): AffectiveForm.tsx, Auto-Save Debounce 800ms, CombinedForm.tsx, components/cupping/ Directory, CupClient.tsx (Orchestrator), DescriptiveForm.tsx, ExtrinsicForm.tsx, FlavorTreeSelector.tsx (+3 more)

### Community 6 - "CupClient State & Auto-Save"
Cohesion: 0.27
Nodes (5): scheduleAutoSave(), setCurrentData(), calcFullDefects(), DefectRowView(), getNum()

### Community 7 - "Database Models"
Cohesion: 0.27
Nodes (10): DB Model: Coffee, DB Model: CuppingSession, DB Model: Evaluation, DB Model: ExtrinsicData, DB Model: PhysicalEvaluation, DB Model: Profile, DB Model: SessionSample, Prisma Client at app/generated/prisma (+2 more)

### Community 8 - "Session Creation Flow"
Cohesion: 0.33
Nodes (5): createSession(), requireUser(), upsertEvaluation(), upsertExtrinsic(), upsertPhysical()

### Community 9 - "Next.js 16 Conventions"
Cohesion: 0.33
Nodes (6): Next.js Breaking Changes Warning, Next.js Docs in node_modules, Async Page Params Pattern, Next.js 16.2.4, Next.js Project (bootstrapped), Vercel Deployment

### Community 10 - "Prisma Browser Runtime"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Evaluation Data Design"
Cohesion: 1.0
Nodes (2): Evaluation JSON Data Shape, Rationale: Flexible JSON for Evaluation Data

### Community 12 - "File Icons"
Cohesion: 1.0
Nodes (2): File Icon SVG, Generic File UI Icon

### Community 13 - "TypeScript Env Config"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Next.js Config"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Prisma Config"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "RSC Pattern"
Cohesion: 1.0
Nodes (1): Server Components by Default

### Community 17 - "Globe Icon"
Cohesion: 1.0
Nodes (1): Globe SVG Icon

### Community 18 - "Next.js Logo"
Cohesion: 1.0
Nodes (1): Next.js Logo

### Community 19 - "Vercel Logo"
Cohesion: 1.0
Nodes (1): Vercel Logo SVG

### Community 20 - "Window Icon"
Cohesion: 1.0
Nodes (1): Window SVG Icon

## Knowledge Gaps
- **38 isolated node(s):** `Next.js Docs in node_modules`, `Async Page Params Pattern`, `React 19.2.4`, `TypeScript 5 (strict)`, `Zustand 5.0.12 (Client State)` (+33 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Prisma Browser Runtime`** (2 nodes): `browser.ts`, `prismaNamespaceBrowser.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Evaluation Data Design`** (2 nodes): `Evaluation JSON Data Shape`, `Rationale: Flexible JSON for Evaluation Data`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `File Icons`** (2 nodes): `File Icon SVG`, `Generic File UI Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `TypeScript Env Config`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js Config`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prisma Config`** (1 nodes): `prisma.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `RSC Pattern`** (1 nodes): `Server Components by Default`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Globe Icon`** (1 nodes): `Globe SVG Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Next.js Logo`** (1 nodes): `Next.js Logo`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vercel Logo`** (1 nodes): `Vercel Logo SVG`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Window Icon`** (1 nodes): `Window SVG Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Project Directory Structure` connect `Project Architecture & Docs` to `Cupping Form Orchestration`, `Database Models`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `Cata Café Project` connect `Project Architecture & Docs` to `Next.js 16 Conventions`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `Tech Stack` connect `Project Architecture & Docs` to `Next.js 16 Conventions`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `Next.js Docs in node_modules`, `Async Page Params Pattern`, `React 19.2.4` to the rest of the system?**
  _38 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Evaluation Form Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Project Architecture & Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Page Components & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._