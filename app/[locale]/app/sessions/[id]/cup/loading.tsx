import { getTranslations } from "next-intl/server";

// J-03 (Q1): the cupping screen's own skeleton, shaped like SessionShell so nothing
// jumps when the page arrives: a fixed full-screen shell (z 40, the surface); the
// side panel (hidden on a phone, 220 px from 641 px, 256 px from 1024 px); on a
// phone the 50 px header and the 45 px stepper bar, on a wide screen the 162 px top
// bar; the form's first section; the footer's two buttons docked at the bottom.
// A new file: the cup route's existing files are not touched.
export default async function CupLoading() {
  const t = await getTranslations("errors");
  const bar = "animate-pulse rounded-card bg-surface-container-high";

  return (
    <div className="fixed inset-0 z-40 flex h-[100dvh] bg-surface text-on-surface">
      <span className="sr-only">{t("loading")}</span>
      <aside
        aria-hidden="true"
        className="hidden min-[641px]:flex min-[641px]:w-[220px] lg:w-[256px] flex-col gap-3 border-r border-outline-variant bg-surface-container p-4"
      >
        <div className={`h-6 w-32 ${bar}`} />
        <div className={`h-10 w-full ${bar}`} />
        <div className={`h-10 w-full ${bar}`} />
        <div className={`h-10 w-full ${bar}`} />
      </aside>
      <div aria-hidden="true" className="relative flex min-w-0 flex-1 flex-col">
        {/* phone and tablet: the header row */}
        <div className="flex h-[50px] items-center gap-3 border-b border-outline-variant px-3 lg:hidden">
          <div className={`h-9 w-9 rounded-pill ${bar}`} />
          <div className={`h-5 w-32 ${bar}`} />
        </div>
        {/* the stepper bar: 45 px on a phone, the 162 px top bar on a wide screen */}
        <div className="flex h-[45px] items-center gap-2 border-b border-outline-variant px-3 lg:h-[162px] lg:flex-col lg:items-start lg:justify-center lg:px-6">
          <div className={`h-8 w-28 rounded-pill ${bar}`} />
          <div className={`hidden h-8 w-72 rounded-pill lg:block ${bar}`} />
        </div>
        <div className="flex-1 space-y-4 overflow-hidden px-4 pt-4 lg:px-12 lg:pt-8">
          <div className={`h-3 w-24 ${bar}`} />
          <div className={`h-[34px] w-full max-w-[420px] rounded-pill ${bar}`} />
          <div className={`h-24 w-full max-w-[640px] ${bar}`} />
        </div>
        <div className="flex h-[64px] items-center justify-between gap-3 border-t border-outline-variant bg-surface px-3">
          <div className={`h-[43px] w-24 rounded-pill ${bar}`} />
          <div className={`h-[43px] w-40 rounded-pill ${bar}`} />
        </div>
      </div>
    </div>
  );
}
