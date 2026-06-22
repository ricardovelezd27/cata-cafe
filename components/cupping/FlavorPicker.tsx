"use client";

import { useState } from "react";
import { ChevronRight, ChevronLeft, Plus, X } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import {
  flavorChildren,
  flavorNodeById,
  flavorGroupColor,
  type FlavorWheelNode,
} from "@/lib/constants";
import { resolveDescriptor } from "@/lib/descriptors";
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
  },
};

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

export function FlavorPicker({
  value,
  onChange,
  maxSelect,
  locale = "es",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  maxSelect?: number;
  locale?: Locale;
}) {
  const t = T[locale];
  const [open, setOpen] = useState(false);
  const [navId, setNavId] = useState<string | null>(null); // current parent being viewed

  // Selection collapses to the deepest node on a drill path: choosing a node drops
  // any selected ancestor of it (deeper replaces shallower), but never removes its
  // descendants (a separate, shallower pick coexists with an existing deeper one).
  // Ids are colon-paths, so ancestry is a pure prefix test.
  const isAncestorOf = (v: string, id: string) => id.startsWith(`${v}:`);

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id));
      return;
    }
    const pruned = value.filter((v) => !isAncestorOf(v, id));
    if (maxSelect !== undefined && pruned.length >= maxSelect) return; // at limit
    onChange([...pruned, id]);
  }

  // Whether selecting `id` would push past maxSelect, accounting for ancestors it
  // would replace (net-zero) — used to disable pills in the modal.
  function wouldExceedLimit(id: string): boolean {
    if (maxSelect === undefined) return false;
    const removed = value.filter((v) => isAncestorOf(v, id)).length;
    return value.length - removed >= maxSelect;
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
              const color = info?.color ?? flavorGroupColor(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  aria-label={`${t.remove}: ${info?.label ?? id}`}
                  className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium text-bg"
                  style={{ background: color }}
                >
                  {info?.label ?? id}
                  <X size={12} aria-hidden />
                </button>
              );
            })}
          </div>
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
            const color = flavorGroupColor(node.id);
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
