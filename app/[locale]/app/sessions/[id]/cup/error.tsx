"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useParams } from "next/navigation";
import { CupClient } from "./CupClient";
import { OfflineFirstLoadError } from "@/components/offline/OfflineFirstLoadError";
import { ErrorPanel } from "@/components/errors/ErrorPanel";
import { loadCachedProps, getLastUser } from "@/lib/offline/store";

type CupClientProps = ComponentProps<typeof CupClient>;

// First-load copy must be available with NO network and NO cache, so it can't
// come through next-intl here. Mirror of messages.*.offline.firstLoadError*
// plus the generic error strings from messages.*.errors.
const COPY: Record<
  string,
  {
    offlineTitle: string;
    retry: string;
    failedTitle: string;
    failedBody: string;
    back: string;
    support: string;
  }
> = {
  es: {
    offlineTitle: "Necesitas conexión para cargar esta sesión por primera vez.",
    retry: "Reintentar",
    failedTitle: "No pudimos cargar esta cata",
    failedBody:
      "Reintentamos automáticamente sin éxito. Vuelve a intentarlo o regresa a tus sesiones; lo que ya guardaste no se pierde.",
    back: "Volver a mis sesiones",
    support: "Código de soporte",
  },
  en: {
    offlineTitle: "You need internet to load this session for the first time.",
    retry: "Retry",
    failedTitle: "We could not load this tasting",
    failedBody:
      "Automatic retries did not help. Try again or go back to your sessions; what you already saved is not lost.",
    back: "Back to my sessions",
    support: "Support code",
  },
};

type State =
  | { phase: "checking" }
  | { phase: "cached"; props: CupClientProps }
  | { phase: "offline-no-cache" }
  | { phase: "failed" };

// Automatic re-fetch budget per session. Module-scoped (not a ref) because
// Next may re-instantiate the boundary component on every re-throw, which is
// exactly the case we are guarding against.
const MAX_AUTO_RETRIES = 2;
const RETRY_WINDOW_MS = 30_000;
const autoRetries = new Map<string, { count: number; firstAt: number }>();

function takeAutoRetry(key: string): boolean {
  const now = Date.now();
  const entry = autoRetries.get(key);
  if (!entry || now - entry.firstAt > RETRY_WINDOW_MS) {
    autoRetries.set(key, { count: 1, firstAt: now });
    return true;
  }
  if (entry.count >= MAX_AUTO_RETRIES) return false;
  entry.count += 1;
  return true;
}

// Error boundary for the cupping route. The page is a Server Component, so a
// cold load / hard refresh while offline throws during the server fetch and
// lands here. Three outcomes:
//   * online, budget left  → unstable_retry() re-fetches the page (NOT reset():
//     reset() only re-renders the same failed tree and loops — see Next's
//     error.md, "unstable_retry" vs "reset")
//   * online, budget spent → a real server-side error; show a retry + back panel
//   * offline              → rebuild from the cached props payload if this
//     session was loaded on this device before, else the first-load screen
export default function CupError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry: () => void;
}) {
  const params = useParams();
  const id = String(params?.id ?? "");
  const locale = String(params?.locale ?? "es");
  const copy = COPY[locale] ?? COPY.es;

  const [state, setState] = useState<State>({ phase: "checking" });

  useEffect(() => {
    console.error("[cup/error]", error.message, error.digest ?? "");
  }, [error]);

  const attempt = async (auto: boolean) => {
    let online = false;
    try {
      const res = await fetch("/api/health", { method: "GET", cache: "no-store" });
      online = res.ok;
    } catch {
      online = false;
    }

    if (online) {
      // A digest means the server rendered and threw (auth, data, bug) — a
      // re-fetch can still help once (transient DB hiccup), but not forever.
      if (!auto || takeAutoRetry(id)) {
        unstable_retry();
        return;
      }
      setState({ phase: "failed" });
      return;
    }

    // Offline: rebuild from the cached props payload if this session was
    // loaded on this device before.
    const userId = await getLastUser();
    if (userId) {
      const cached = await loadCachedProps<CupClientProps>(id, userId);
      if (cached && cached.userId === userId) {
        setState({ phase: "cached", props: cached });
        return;
      }
    }
    setState({ phase: "offline-no-cache" });
  };

  useEffect(() => {
    // Run the connectivity/cache probe once on mount. setState only fires after
    // the awaited fetch (asynchronously), so it doesn't cascade renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void attempt(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.phase === "cached") {
    return <CupClient {...state.props} />;
  }

  if (state.phase === "failed") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <ErrorPanel
          title={copy.failedTitle}
          body={copy.failedBody}
          retryLabel={copy.retry}
          onRetry={() => {
            autoRetries.delete(id);
            setState({ phase: "checking" });
            void attempt(false);
          }}
          homeLabel={copy.back}
          homeHref={`/${locale}/app/sessions`}
          supportLabel={copy.support}
          digest={error.digest}
        />
      </main>
    );
  }

  // "checking" briefly shows the same calm screen rather than a flash of error.
  return (
    <OfflineFirstLoadError
      title={copy.offlineTitle}
      retryLabel={copy.retry}
      onRetry={() => {
        setState({ phase: "checking" });
        void attempt(false);
      }}
    />
  );
}
