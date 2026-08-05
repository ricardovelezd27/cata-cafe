"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, Plus, X, Search, CornerDownLeft } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import {
  flavorChildren,
  flavorNodeById,
  flavorNodeColor,
  getContrastTextColor,
  type FlavorWheelNode,
} from "@/lib/constants";
import { resolveDescriptor } from "@/lib/descriptors";
import { searchFlavors, norm, type FlavorMatchType } from "@/lib/flavorSearch";
import pillStyles from "@/components/ui/CATAPills.module.css";

type Locale = "es" | "en";

const T: Record<Locale, Record<string, string>> = {
  es: {
    add: "Agregar descriptores",
    selected: "Seleccionados",
    none: "Ningún descriptor seleccionado",
    title: "Descriptores de sabor",
    all: "Todos",
    back: "Atrás",
    upTo: "Selecciona hasta",
    done: "Listo",
    remove: "Quitar",
    search: "Escribe un descriptor…",
    addUnderOtherFruit: "Agregar en «Otra fruta»",
    addUnderOther: "Agregar en «Otros»",
    close: "Cerrar",
  },
  en: {
    add: "Add descriptors",
    selected: "Selected",
    none: "No descriptors selected",
    title: "Flavor descriptors",
    all: "All",
    back: "Back",
    upTo: "Select up to",
    done: "Done",
    remove: "Remove",
    search: "Type a descriptor…",
    addUnderOtherFruit: 'Add under "Other Fruit"',
    addUnderOther: 'Add under "Other"',
    close: "Close",
  },
};

/** Generic buckets the closed fallback routes unmatched terms into. */
const OTHER_FRUIT_ID = "fruity:other_fruit";
const OTHER_ID = "other";

function label(node: FlavorWheelNode, locale: Locale): string {
  return locale === "en" ? node.label_en : node.label_es;
}

/** Ancestor chain (root-first) of a node id, for breadcrumb navigation. */
function pathOf(id: string | null): FlavorWheelNode[] {
  const out: FlavorWheelNode[] = [];
  let node = id ? flavorNodeById(id) : undefined;
  while (node) {
    out.unshift(node);
    node = node.parentId ? flavorNodeById(node.parentId) : undefined;
  }
  return out;
}

/** One closed-fallback row that routes the typed term into a generic node. */
function GenericRow({
  id,
  copy,
  term,
  rowIndex,
  active,
  onPick,
  onHover,
}: {
  id: string;
  copy: string;
  term: string;
  rowIndex: number;
  active: boolean;
  onPick: (id: string) => void;
  onHover: (i: number) => void;
}) {
  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onPick(id);
        }}
        onMouseEnter={() => onHover(rowIndex)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
          active ? "bg-cream" : ""
        }`}
      >
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: flavorNodeColor(id) }}
          aria-hidden
        />
        <span className="text-[13px] text-brown-dark">
          {copy}: <span className="font-medium">«{term}»</span>
        </span>
        <CornerDownLeft
          size={13}
          aria-hidden
          className="ml-auto shrink-0 text-brown-mid"
        />
      </button>
    </li>
  );
}

/** Case/accent-insensitive equality for "did the typed term differ from the label". */
function sameText(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

export function FlavorPicker({
  value,
  onChange,
  notes,
  maxSelect,
  locale = "es",
}: {
  value: string[];
  /**
   * Change callback. When `notes` is provided, every change emits the next
   * selection AND the next notes map in ONE call — the parent state is a
   * wholesale JSON blob replaced per callback, so value+notes must land
   * atomically (two same-tick callbacks would last-write-wins each other).
   */
  onChange: (next: string[], nextNotes?: Record<string, string[]>) => void;
  /** Qualifying notes per node id (parallel `*_desc_notes` JSON key). */
  notes?: Record<string, string[]>;
  maxSelect?: number;
  locale?: Locale;
}) {
  const t = T[locale];
  const notesEnabled = notes !== undefined;
  const notesMap = notes ?? {};
  const [open, setOpen] = useState(false);
  const [navId, setNavId] = useState<string | null>(null); // current parent being viewed

  // Predictive typeahead — a filter over the same wheel, feeding the same value.
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [hi, setHi] = useState(0); // highlighted dropdown row
  const inputRef = useRef<HTMLInputElement>(null);

  // Selection collapses to the deepest node on a drill path: choosing a node drops
  // any selected ancestor of it (deeper replaces shallower), but never removes its
  // descendants (a separate, shallower pick coexists with an existing deeper one).
  // Ids are colon-paths, so ancestry is a pure prefix test.
  const isAncestorOf = (v: string, id: string) => id.startsWith(`${v}:`);

  /** Pure: `map` minus the note buckets of `ids` (same object when a no-op). */
  function notesWithout(
    map: Record<string, string[]>,
    ids: string[]
  ): Record<string, string[]> {
    const drop = ids.filter((i) => i in map);
    if (drop.length === 0) return map;
    const next = { ...map };
    for (const i of drop) delete next[i];
    return next;
  }

  /** Pure: `map` plus a trimmed, deduped qualifying term under a node id. */
  function notesWith(
    map: Record<string, string[]>,
    id: string,
    term: string
  ): Record<string, string[]> {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) return map;
    const existing = map[id] ?? [];
    if (existing.some((x) => sameText(x, trimmedTerm))) return map;
    return { ...map, [id]: [...existing, trimmedTerm] };
  }

  /** Single atomic emission of the next selection + notes pair. */
  function emit(nextValue: string[], nextNotes: Record<string, string[]>) {
    onChange(nextValue, notesEnabled ? nextNotes : undefined);
  }

  /**
   * Pure: next (value, notes) after selecting `id`. A deeper pick replaces any
   * selected ancestors — which take their qualifying notes with them, so no
   * note bucket outlives its selected chip.
   */
  function selectionWith(id: string): {
    nextValue: string[];
    nextNotes: Record<string, string[]>;
  } {
    const prunedAncestors = value.filter((v) => isAncestorOf(v, id));
    return {
      nextValue: [...value.filter((v) => !isAncestorOf(v, id)), id],
      nextNotes: notesWithout(notesMap, prunedAncestors),
    };
  }

  function toggle(id: string) {
    if (value.includes(id)) {
      // Removing a chip drops that node's notes too.
      emit(value.filter((x) => x !== id), notesWithout(notesMap, [id]));
      return;
    }
    const { nextValue, nextNotes } = selectionWith(id);
    if (maxSelect !== undefined && nextValue.length > maxSelect) return; // at limit
    emit(nextValue, nextNotes);
  }

  // Whether selecting `id` would push past maxSelect, accounting for ancestors it
  // would replace (net-zero) — used to disable pills in the modal.
  function wouldExceedLimit(id: string): boolean {
    if (maxSelect === undefined) return false;
    const removed = value.filter((v) => isAncestorOf(v, id)).length;
    return value.length - removed >= maxSelect;
  }

  const trimmed = query.trim();
  const results = useMemo(
    () => (trimmed ? searchFlavors(trimmed, { locale }) : []),
    [trimmed, locale]
  );
  // Closed fallback: when nothing matches the wheel, offer to route the typed
  // term into a real generic node («Otra fruta» / «Otros») as a qualifying note
  // — never a free-standing unmapped entry.
  const showGeneric = trimmed.length > 0 && results.length === 0 && notesEnabled;
  const rowCount = results.length + (showGeneric ? 2 : 0);
  const dropdownOpen = focused && rowCount > 0;
  const clampedHi = Math.min(hi, Math.max(0, rowCount - 1));

  /**
   * Pick a real wheel node from the typeahead. If it is a "parent" (L1/L2)
   * match whose label differs from what the cupper typed, keep the literal term
   * as a qualifying note (Kim's "plátano deshidratado" under "Fruta
   * deshidratada"). Leaf exact/prefix/synonym/fuzzy picks attach no note.
   */
  function addById(
    id: string,
    opts?: { matchType?: FlavorMatchType; typed?: string }
  ) {
    if (!value.includes(id) && !wouldExceedLimit(id)) {
      const { nextValue, nextNotes } = selectionWith(id);
      let withNote = nextNotes;
      if (opts?.matchType === "parent" && opts.typed) {
        const node = flavorNodeById(id);
        const nodeLabel = node ? label(node, locale) : "";
        if (nodeLabel && !sameText(opts.typed, nodeLabel)) {
          withNote = notesWith(nextNotes, id, opts.typed);
        }
      }
      emit(nextValue, withNote);
    }
    setQuery("");
    setHi(0);
    inputRef.current?.focus();
  }

  /** Route the unmatched typed term into a generic node with a qualifying note. */
  function addGeneric(id: string) {
    if (!trimmed) return;
    if (value.includes(id)) {
      // Node already selected: just append the term to its note bucket.
      emit(value, notesWith(notesMap, id, trimmed));
    } else if (!wouldExceedLimit(id)) {
      const { nextValue, nextNotes } = selectionWith(id);
      emit(nextValue, notesWith(nextNotes, id, trimmed));
    }
    setQuery("");
    setHi(0);
    inputRef.current?.focus();
  }

  function commitRow(i: number) {
    if (i < results.length) {
      const m = results[i];
      addById(m.id, { matchType: m.matchType, typed: trimmed });
    } else if (showGeneric) {
      addGeneric(i === results.length ? OTHER_FRUIT_ID : OTHER_ID);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((p) => Math.min(p + 1, rowCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitRow(clampedHi);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  }

  const crumbs = pathOf(navId);
  const children = flavorChildren(navId);

  return (
    <div className={pillStyles.root}>
      {/* Selected chips — persistent section, visible on the form */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.16em] uppercase text-brown-mid">
            {t.selected}
            {maxSelect !== undefined && (
              <span className="ml-1 normal-case tracking-normal">
                ({value.length}/{maxSelect})
              </span>
            )}
          </span>
        </div>
        {value.length === 0 ? (
          <p className="text-[12px] text-brown-mid italic">{t.none}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {value.map((id) => {
              const info = resolveDescriptor(id, locale);
              const color = info?.color ?? flavorNodeColor(id);
              const nodeNotes = notesMap[id] ?? [];
              const baseLabel = info?.label ?? id;
              const chipLabel =
                nodeNotes.length > 0
                  ? `${baseLabel} ${nodeNotes.map((n) => `«${n}»`).join(" ")}`
                  : baseLabel;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={`${t.remove}: ${chipLabel}`}
                  className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium"
                  style={{ background: color, color: getContrastTextColor(color) }}
                >
                  {chipLabel}
                  <X size={12} aria-hidden />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Predictive typeahead — type to filter the wheel; sits alongside browse */}
      <div className="relative mb-2">
        <div className="relative">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brown-mid"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHi(0);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={onInputKeyDown}
            placeholder={t.search}
            aria-label={t.search}
            autoComplete="off"
            className="w-full rounded-pill border-[1.5px] border-brown-light/60 bg-bg py-1.5 pl-9 pr-3 text-[13px] text-brown-dark placeholder:text-brown-mid focus:border-green-mid focus:outline-none"
          />
        </div>

        {dropdownOpen && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-brown-light/50 bg-bg py-1 shadow-lg"
          >
            {results.map((m, i) => (
              <li key={m.id} role="option" aria-selected={i === clampedHi}>
                <button
                  type="button"
                  // onMouseDown (not onClick) so it fires before input blur closes the list
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addById(m.id, { matchType: m.matchType, typed: trimmed });
                  }}
                  onMouseEnter={() => setHi(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
                    i === clampedHi ? "bg-cream" : ""
                  }`}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: m.color }}
                    aria-hidden
                  />
                  <span className="text-[13px] font-medium text-brown-dark">
                    {m.label}
                  </span>
                  {m.path && (
                    <span className="ml-auto truncate pl-2 text-[11px] text-brown-mid">
                      {m.path}
                    </span>
                  )}
                </button>
              </li>
            ))}

            {showGeneric && (
              <>
                <GenericRow
                  id={OTHER_FRUIT_ID}
                  copy={t.addUnderOtherFruit}
                  term={trimmed}
                  rowIndex={results.length}
                  active={clampedHi === results.length}
                  onPick={addGeneric}
                  onHover={setHi}
                />
                <GenericRow
                  id={OTHER_ID}
                  copy={t.addUnderOther}
                  term={trimmed}
                  rowIndex={results.length + 1}
                  active={clampedHi === results.length + 1}
                  onPick={addGeneric}
                  onHover={setHi}
                />
              </>
            )}
          </ul>
        )}
      </div>

      {/* Open-modal trigger */}
      <button
        type="button"
        onClick={() => {
          setNavId(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-pill border-[1.5px] border-dashed border-green-mid px-3.5 py-1.5 text-[13px] font-medium text-green-dark transition-colors hover:bg-green-mid/10"
      >
        <Plus size={15} aria-hidden />
        {t.add}
      </button>

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={t.title}
        subtitle={
          maxSelect !== undefined
            ? `${t.upTo} ${maxSelect} · ${value.length}/${maxSelect}`
            : undefined
        }
        closeLabel={t.close}
      >
        {/* Breadcrumb */}
        <nav className="flex flex-wrap items-center gap-1 text-[12px] mb-3">
          <button
            type="button"
            onClick={() => setNavId(null)}
            className={`font-medium ${navId === null ? "text-brown-dark" : "text-green-dark hover:underline"}`}
          >
            {t.all}
          </button>
          {crumbs.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight size={13} className="text-brown-mid" aria-hidden />
              <button
                type="button"
                onClick={() => setNavId(c.id)}
                className={`font-medium ${c.id === navId ? "text-brown-dark" : "text-green-dark hover:underline"}`}
              >
                {label(c, locale)}
              </button>
            </span>
          ))}
        </nav>

        {navId !== null && (
          <button
            type="button"
            onClick={() =>
              setNavId(flavorNodeById(navId)?.parentId ?? null)
            }
            className="inline-flex items-center gap-1 text-[12px] font-medium text-green-dark hover:underline mb-3"
          >
            <ChevronLeft size={14} aria-hidden />
            {t.back}
          </button>
        )}

        {/* Node list */}
        <div className="flex flex-col gap-2">
          {children.map((node) => {
            const grandchildren = flavorChildren(node.id);
            const hasChildren = grandchildren.length > 0;
            const selectable = node.level >= 2; // L1 groups are navigation-only
            const isSel = value.includes(node.id);
            const color = flavorNodeColor(node.id);
            const disabled = selectable && !isSel && wouldExceedLimit(node.id);

            return (
              <div key={node.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    selectable ? toggle(node.id) : setNavId(node.id)
                  }
                  aria-pressed={selectable ? isSel : undefined}
                  className={`${pillStyles.pill} ${isSel ? pillStyles.selected : ""} flex-1 !justify-start`}
                  style={
                    {
                      "--pill-color": color,
                      "--pill-bg-soft": `color-mix(in oklch, ${color} 10%, transparent)`,
                      "--pill-text": getContrastTextColor(color),
                    } as React.CSSProperties
                  }
                >
                  <span className={pillStyles.dot} />
                  {label(node, locale)}
                </button>

                {hasChildren && (
                  <button
                    type="button"
                    onClick={() => setNavId(node.id)}
                    aria-label={label(node, locale)}
                    className="shrink-0 rounded-full p-1.5 text-brown-mid hover:bg-cream hover:text-brown-dark transition-colors"
                  >
                    <ChevronRight size={18} aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-pill bg-green-dark px-5 py-2 text-[13px] font-semibold text-bg"
          >
            {t.done}
          </button>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
