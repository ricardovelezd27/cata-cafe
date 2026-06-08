"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useParams } from "next/navigation";
import { CupClient } from "./CupClient";
import { OfflineFirstLoadError } from "@/components/offline/OfflineFirstLoadError";
import { loadCachedProps, getLastUser } from "@/lib/offline/store";

type CupClientProps = ComponentProps<typeof CupClient>;

// First-load copy must be available with NO network and NO cache, so it can't
// come through next-intl here. Mirror of messages.*.offline.firstLoadError*.
const FIRST_LOAD_COPY: Record<string, { title: string; retry: string }> = {
  es: {
    title: "Necesitas conexión para cargar esta sesión por primera vez.",
    retry: "Reintentar",
  },
  en: {
    title: "You need internet to load this session for the first time.",
    retry: "Retry",
  },
};

type State =
  | { phase: "checking" }
  | { phase: "cached"; props: CupClientProps }
  | { phase: "error" };

// Error boundary for the cupping route. The page is a Server Component, so a
// cold load / hard refresh while offline throws during the server fetch and
// lands here. We then either rebuild the screen from the cached props payload
// (offline-but-previously-loaded) or show the first-load error.
export default function CupError({ reset }: { error: Error; reset: () => void }) {
  const params = useParams();
  const id = String(params?.id ?? "");
  const locale = String(params?.locale ?? "es");
  const copy = FIRST_LOAD_COPY[locale] ?? FIRST_LOAD_COPY.es;

  const [state, setState] = useState<State>({ phase: "checking" });

  const attempt = async () => {
    // First setState happens only after the await below, so it's asynchronous —
    // the initial render already shows the "checking" state.
    let online = false;
    try {
      const res = await fetch("/api/health", { method: "GET", cache: "no-store" });
      online = res.ok;
    } catch {
      online = false;
    }
    if (online) {
      reset();
      return;
    }

    // Offline: rebuild from the cached props payload if this session was loaded
    // on this device before.
    const userId = await getLastUser();
    if (userId) {
      const cached = await loadCachedProps<CupClientProps>(id, userId);
      if (cached && cached.userId === userId) {
        setState({ phase: "cached", props: cached });
        return;
      }
    }
    setState({ phase: "error" });
  };

  useEffect(() => {
    // Run the connectivity/cache probe once on mount. setState only fires after
    // the awaited fetch (asynchronously), so it doesn't cascade renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.phase === "cached") {
    return <CupClient {...state.props} />;
  }

  const handleRetry = () => {
    setState({ phase: "checking" });
    void attempt();
  };

  // "checking" briefly shows the same calm screen rather than a flash of error.
  return (
    <OfflineFirstLoadError
      title={copy.title}
      retryLabel={copy.retry}
      onRetry={handleRetry}
    />
  );
}
