"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import styles from "./SessionShell.module.css";

interface SessionShellProps {
  /** Identity block: session name, format pill, etc. Rendered at top of sidebar. */
  identity: ReactNode;
  /** Primary nav (e.g. SampleTabs). */
  primaryNav: ReactNode;
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
  /** Auto-save status — drives the top-right indicator dot. */
  saveStatus?: "idle" | "saving" | "saved";
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
  saveStatus = "idle",
}: SessionShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className={styles.root}>
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
          <div className={styles.primaryNavSlot}>{primaryNav}</div>
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
            className={`${styles.saveIndicator} ${saveStatus === "saved" ? styles.saveIndicatorSaved : ""}`}
            aria-hidden
          />
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
          {mobileTitle && (
            <span
              className="font-display text-base text-brown-dark truncate"
              style={{ flex: 1, minWidth: 0 }}
            >
              {mobileTitle}
            </span>
          )}
        </div>

        {topBar && <div className={styles.topBar}>{topBar}</div>}

        <div className={styles.canvas} data-session-canvas>
          <div className={styles.canvasInner}>{children}</div>
          {footer}
        </div>
      </div>
    </div>
  );
}
