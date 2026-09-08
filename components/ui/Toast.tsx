"use client";

// Shared feedback primitive for the server-action contract in
// lib/actionResult.ts / lib/safeAction.ts. Mounted once at the locale layout
// (app/[locale]/layout.tsx) so any client component under it can call
// useActionFeedback() without prop-drilling a translations table around.
//
// `translations` is the `errors.codes` table (one entry per ActionErrorCode)
// plus `dismiss` — built once, server-side, in the locale layout via
// getTranslations("errors").

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { isActionErrorCode, type ActionErrorCode, type ActionResult } from "@/lib/actionResult";

const AUTO_DISMISS_MS = 5000;

type ToastTone = "success" | "error";

type ToastItem = {
  id: number;
  tone: ToastTone;
  message: string;
};

export type ActionFeedbackTranslations = Record<string, string>;

type ActionFeedbackContextValue = {
  notifySuccess: (message: string) => void;
  notifyError: (code: ActionErrorCode | string) => void;
  run: <T>(
    promise: Promise<ActionResult<T>>,
    onOk?: (data: T) => void | Promise<void>,
  ) => Promise<ActionResult<T>>;
};

const ActionFeedbackContext = createContext<ActionFeedbackContextValue | null>(null);

let nextToastId = 0;

export function ActionFeedbackProvider({
  translations,
  children,
}: {
  translations: ActionFeedbackTranslations;
  children: ReactNode;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = ++nextToastId;
      setToasts((prev) => [...prev, { id, tone, message }]);
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  // Clear any pending auto-dismiss timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const notifySuccess = useCallback((message: string) => push("success", message), [push]);

  const notifyError = useCallback(
    (code: ActionErrorCode | string) => {
      const key = isActionErrorCode(code) ? code : "unknown";
      push("error", translations[key] ?? translations.unknown ?? key);
    },
    [push, translations],
  );

  const run = useCallback(
    async <T,>(
      promise: Promise<ActionResult<T>>,
      onOk?: (data: T) => void | Promise<void>,
    ): Promise<ActionResult<T>> => {
      try {
        const result = await promise;
        if (result.ok) {
          await onOk?.(result.data);
        } else {
          notifyError(result.error);
        }
        return result;
      } catch (err) {
        // An action that still throws (redirect()/notFound() included) —
        // let Next's own redirect digest pass through untouched.
        const digest = (err as { digest?: unknown } | null)?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        notifyError("unknown");
        return { ok: false, error: "unknown" };
      }
    },
    [notifyError],
  );

  return (
    <ActionFeedbackContext.Provider value={{ notifySuccess, notifyError, run }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-height,0px)+env(safe-area-inset-bottom,0px)+16px)] z-[100] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:right-4 md:bottom-4 md:items-end md:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-card px-4 py-3 text-sm shadow-card-lg ${
              toast.tone === "error"
                ? "bg-error-container text-on-error-container"
                : "bg-inverse-surface text-inverse-on-surface"
            }`}
          >
            {toast.tone === "error" ? (
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
            )}
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={translations.dismiss ?? "Dismiss"}
              className="shrink-0 opacity-80 transition-opacity hover:opacity-100"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ActionFeedbackContext.Provider>
  );
}

export function useActionFeedback(): ActionFeedbackContextValue {
  const ctx = useContext(ActionFeedbackContext);
  if (!ctx) {
    throw new Error("useActionFeedback must be used within an ActionFeedbackProvider");
  }
  return ctx;
}
