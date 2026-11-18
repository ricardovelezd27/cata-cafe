"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Menu, X } from "lucide-react";
import { useCoverShell } from "@/hooks/useShellLayer";
import styles from "./SessionShell.module.css";

interface SessionShellProps {
  /** Identity block: session name, format pill, etc. Rendered at top of sidebar. */
  identity: ReactNode;
  /** Primary nav (e.g. SampleTabs). Optional — omit when nav lives elsewhere. */
  primaryNav?: ReactNode;
  /** Secondary nav (e.g. ModuleSwitcher). */
  secondaryNav: ReactNode;
  /** Optional owner-only block (e.g. MasterControls). */
  ownerControls?: ReactNode;
  /** Bottom-of-sidebar link, e.g. "← Salir a sesiones". */
  exitLink: ReactNode;
  /** Optional top bar above the canvas (e.g. PhaseStepper or breadcrumb). */
  topBar?: ReactNode;
  /** Canvas content. */
  children: ReactNode;
  /** Optional sticky in-canvas footer (e.g. CanvasFooter). */
  footer?: ReactNode;
  /** Optional title shown next to hamburger on mobile. */
  mobileTitle?: string;
  /** Phone-only (<640px) content rendered in the hamburger row INSTEAD of
   *  `mobileTitle` — e.g. the sample tabs, so header + sample bar share one
   *  compact row (CP-C1). */
  mobileBar?: ReactNode;
  /** Phone-only panel behind a chevron at the right of the hamburger row:
   *  session name, role, reference context, edit button… Rendered in flow
   *  under the row while open. Requires `mobileBar`. */
  mobileDetails?: ReactNode;
  /** aria-label for the chevron that toggles `mobileDetails`. */
  mobileDetailsLabel?: string;
  /** While true (on-screen keyboard up), the phone header row and the top bar
   *  are hidden so the focused field gets the space. */
  collapsed?: boolean;
  /** Auto-save status — drives the top-right indicator dot. "pending" means
   *  the last write only landed in local (IndexedDB) storage — it has not
   *  reached the server yet. */
  saveStatus?: "idle" | "saving" | "saved" | "pending";
  /** Label shown in the header's flow only when saveStatus === "pending". */
  savePendingLabel?: string;
  /** D-12: the drawer's names (translated by the page). */
  navLabels?: { open: string; title: string };
  /** J-04: the phone's way out, in the header row (the page's guarded exit). */
  onMobileExit?: () => void;
  mobileExitLabel?: string;
  /** F-05 (S5b): one tool in the phone's header row (the cupping timer's link). */
  mobileTool?: { label: string; icon: ReactNode; onClick: () => void; expanded?: boolean };
}

export function SessionShell({
  identity,
  primaryNav,
  secondaryNav,
  ownerControls,
  exitLink,
  topBar,
  children,
  footer,
  mobileTitle,
  mobileBar,
  mobileDetails,
  mobileDetailsLabel,
  collapsed = false,
  saveStatus = "idle",
  savePendingLabel,
  navLabels,
  onMobileExit,
  mobileExitLabel,
  mobileTool,
}: SessionShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // H-03: this layer is fixed over the whole app layout; while it is mounted
  // the layout's sidebar, bars and notices are inert (they read the same
  // store). Focusability only: no saving, guard or realtime code is involved.
  useCoverShell();

  const navTitle = navLabels?.title ?? "Navegación de la sesión";

  const sidebarContent = (
    <>
      <div className={styles.identity}>{identity}</div>

      <div className={styles.navStack}>
        {primaryNav && <div className={styles.primaryNavSlot}>{primaryNav}</div>}
        {secondaryNav}
      </div>

      <div className={styles.spacer} />

      {ownerControls && <div className={styles.ownerSlot}>{ownerControls}</div>}

      <div className={styles.exit}>{exitLink}</div>
    </>
  );

  // D-12: picking an item in the drawer closes it, AFTER the item's own handler ran (bubble
  // phase: closing in the capture phase unmounts the item before its onClick is reached).
  // A field or a select does not close it; nothing here saves or navigates.
  const closeOnPick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element | null;
    if (target?.closest("button, a")) setDrawerOpen(false);
  };

  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <div className={`${styles.root} ${collapsed ? styles.collapsed : ""}`}>
        {/* Sidebar: always there from 641 px; on a phone it is the drawer below. */}
        <aside className={styles.sidebar} aria-label={navTitle}>
          {sidebarContent}
        </aside>

        {/* Main column */}
        <div className={styles.main}>
          {saveStatus !== "idle" && (
            <div
              className={`${styles.saveIndicator} ${
                saveStatus === "saved" ? styles.saveIndicatorSaved : ""
              } ${saveStatus === "pending" ? styles.saveIndicatorPending : ""}`}
              aria-hidden
            />
          )}
          {/* Mobile-only header with hamburger */}
          <div className={styles.mobileHeader}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className={styles.hamburger}
                aria-label={navLabels?.open ?? "Abrir navegación"}
              >
                <Menu size={18} aria-hidden />
              </button>
            </Dialog.Trigger>
            {mobileBar ? (
              <div className={styles.mobileBarSlot}>{mobileBar}</div>
            ) : (
              mobileTitle && (
                <span
                  className="font-display text-body text-on-surface truncate"
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {mobileTitle}
                </span>
              )
            )}
            {mobileTool && (
              <button
                type="button"
                className={styles.toolButton}
                onClick={mobileTool.onClick}
                aria-label={mobileTool.label}
                aria-expanded={mobileTool.expanded}
              >
                {mobileTool.icon}
              </button>
            )}
            {mobileBar && mobileDetails && (
              <button
                type="button"
                className={`${styles.detailsToggle} ${detailsOpen ? styles.detailsToggleOpen : ""}`}
                onClick={() => setDetailsOpen((v) => !v)}
                aria-label={mobileDetailsLabel ?? "Session details"}
                aria-expanded={detailsOpen}
              >
                <ChevronDown size={16} aria-hidden />
              </button>
            )}
            {onMobileExit && (
              <button
                type="button"
                data-cup-exit
                className={styles.exitButton}
                onClick={onMobileExit}
                aria-label={mobileExitLabel}
              >
                <X size={18} aria-hidden />
              </button>
            )}
          </div>
          {mobileBar && mobileDetails && detailsOpen && (
            <div className={styles.mobileDetails}>{mobileDetails}</div>
          )}
          {/* A-08: the pending state sits in the flow of the header, never over the tabs. */}
          {saveStatus === "pending" && savePendingLabel && (
            <div className={styles.savePendingLabel} role="status" aria-live="polite">
              {savePendingLabel}
            </div>
          )}

          {topBar && <div className={styles.topBar}>{topBar}</div>}

          <div className={styles.canvas} data-session-canvas>
            <div className={styles.canvasInner}>{children}</div>
            {footer}
          </div>
        </div>
      </div>

      {/* D-12: on a phone the sidebar is a real dialog: Escape and a tap outside close it,
          focus stays inside while open and goes back to the menu button. */}
      <Dialog.Portal>
        <Dialog.Overlay className={styles.drawerOverlay} />
        <Dialog.Content className={styles.drawer} aria-describedby={undefined} onClick={closeOnPick}>
          <Dialog.Title className="sr-only">{navTitle}</Dialog.Title>
          {sidebarContent}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
