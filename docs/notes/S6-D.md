# S6 Stream D — descriptors: notes for flows.md / CLAUDE.md

Five PRs, stacked: D0 (#25, independent) → D1 (#28) → D2 (#35) → D3 (#37) → D4.
Retarget each to `main` as its parent merges.

## Facts worth recording

- **Results aggregation is additive.** `SampleBlockFreq` now also carries
  `stages` (stageId → `RankedDescriptor[]`, per-stage cupper counts, NOT deduped
  across stages) and `rollup` (blockId + `"general"` → `RollupGroup[]`: L1/L2 wheel
  groups, per-block cupper-deduped `count`, typed `notes`). `blocks`/`summary` are
  unchanged, so `lib/closeEmail.ts` and the PDFs are untouched.
- **Word cloud rule (S5 item 1).** One word per descriptor; size = mentions summed
  over stages (fragancia 1 + aroma 1 = 2); same-label entries merge
  case-insensitively; tap pins a word and shows "Fragancia 3 · Aroma 2" as a caption.
  `DEFAULT_MAX_WORDS` = 30. The bars (`DescriptorFrequency`) count cuppers per BLOCK,
  so cloud and bars can legitimately differ (help.nube says so).
- **Singleton toggle.** "Ocultar descriptores de una sola persona", default OFF,
  `localStorage["cata_results_hide_singles"]` (external-store pattern like
  `cata_results_view`), hidden for solo sessions. "Single person" is computed from
  the per-cupper-deduped `blocks` counts (`sharedLabelKeys`), not from the cloud's
  stage sum. It also drives `DescriptorFrequency.minCount` (1 off / 2 on), so group
  bars now show 1-person descriptors by default (was: hidden). Copy `descEmptyAll`
  still says "2 or more cuppers" — now only accurate with the toggle on.
- **`ancestorsOf(id)`** (`lib/descriptors.ts`): root-first ancestors excluding self,
  migrates retired ids. The walk is COPIED from `cvaFormData.buildFlavorGroups`
  (that file was off-limits while Stream A edits it) — Stream A can switch
  `buildFlavorGroups` to the helper afterwards.
- **FlavorPicker file-under.** No fixed "Otra fruta / Otros" rows any more. Unmatched
  typed word → one row "Agregar «word»…" → browse modal in file-under mode (tap an
  L2/L3 → `fileWord`, word stored as `<stage>_desc_notes[nodeId]`); "Ninguna encaja —
  dejar en «Otros»" at the bottom. Banner "Has puesto N en «Otros» — ¿en qué categoría
  van?" is per picker (per stage) and visible whenever words sit under `other` /
  `fruity:other_fruit`; re-filing is atomic (one `onChange`) and an emptied bucket
  drops its chip. No schema, no aggregation change.
- **Synonym dictionary.** `lib/flavorSynonyms.ts` (term → one wheel id; es+en;
  accent-insensitive; unique; never shadows a label — enforced by
  `tests/flavorSynonyms.test.ts`). `searchFlavors` ranks a dictionary hit first
  (`matchType: "dictionary"`, rank −1; phrase tokens −0.5; 3+ char prefixes 2.6) and
  `FlavorPicker.addById` keeps the typed word as a qualifying note for
  `"parent" | "dictionary"` hits. Most tropical fruits map to the L2 `fruity:other_fruit`
  because the wheel has no L3 for them. **Needs Kim's review before merge**
  (least certain: damasco/apricot → peach; ginger/cardamom → brown_spice).
- **Not done / gated:** Phase C Gemini sweep of "Otros" notes (needs
  `descriptor_suggestions` table + exception to "AI gets aggregates only" and
  "closed = read-only"); acidity/sweetness/mouthfeel restructure waits for Kim's
  review of the Excel from D0 (`npm run export:descriptors -- out.xlsx`).

## Suggested doc edits

- CLAUDE.md "Reference Data": mention `lib/flavorSynonyms.ts` beside `FLAVOR_WHEEL`
  and the `export:descriptors` script.
- CLAUDE.md "Aggregate/Results": the additive `stages` / `rollup` fields and the
  hide-singles toggle key.
- flows.md: the FlavorPicker file-under flow (unmatched word → modal → note under
  node) if descriptor entry is diagrammed.

## Verification gaps

- D1/D2 UI not screenshotted (needs an authenticated session on the prod DB).
- D3 verified in a throwaway harness page (mobile bottom sheet + desktop dialog,
  re-file queue); harness not committed.
