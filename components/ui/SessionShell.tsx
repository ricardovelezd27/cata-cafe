"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Menu } from "lucide-react";
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
  /** Label shown next to the dot only when saveStatus === "pending". */
  savePendingLabel?: string;
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
}: SessionShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className={`${styles.root} ${collapsed ? styles.collapsed : ""}`}>
      {/* Mobile-only backdrop */}
      <div
        className={`${styles.backdrop ?? ""} ${drawerOpen ? styles.open : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden
      />

      {/* Sidebar */}
      <aside
        className={`${styles.sidebar} ${drawerOpen ? styles.open : ""}`}
        aria-label="Session navigation"
      >
        <div className={styles.identity}>{identity}</div>

        <div className={styles.navStack}>
          {primaryNav && (
            <div className={styles.primaryNavSlot}>{primaryNav}</div>
          )}
          {secondaryNav}
        </div>

        <div className={styles.spacer} />

        {ownerControls && (
          <div className={styles.ownerSlot}>{ownerControls}</div>
        )}

        <div className={styles.exit}>{exitLink}</div>
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
        {saveStatus === "pending" && savePendingLabel && (
          <div className={styles.savePendingLabel} role="status" aria-live="polite">
            {savePendingLabel}
          </div>
        )}
        {/* Mobile-only header with hamburger */}
        <div className={styles.mobileHeader}>
          <button
            type="button"
            className={styles.hamburger}
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <Menu size={18} aria-hidden />
          </button>
          {mobileBar ? (
            <div className={styles.mobileBarSlot}>{mobileBar}</div>
          ) : (
            mobileTitle && (
              <span
                className="font-display text-base text-brown-dark truncate"
                style={{ flex: 1, minWidth: 0 }}
              >
                {mobileTitle}
              </span>
            )
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
        </div>
        {mobileBar && mobileDetails && detailsOpen && (
          <div className={styles.mobileDetails}>{mobileDetails}</div>
        )}

        {topBar && <div className={styles.topBar}>{topBar}</div>}

        <div className={styles.canvas} data-session-canvas>
          <div className={styles.canvasInner}>{children}</div>
          {footer}
        </div>
      </div>
    </div>
  );
}
