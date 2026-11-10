// Foreground-resume gate (S8-15). Pure and clock-injectable.
//
// A phone that was locked / backgrounded / offline comes back with dead
// realtime sockets and stale server data. The hook (hooks/useForegroundResume)
// feeds this gate the page events and calls back when a resume is worth acting
// on: visible again after at least `minHiddenMs`, or the network came back.
// Bursts (visibilitychange + online firing together) collapse into ONE call.
//
// TODO(native): feed the same gate from Capacitor App "appStateChange"
// ({ isActive: true }) so a WebView that never fires visibilitychange resumes too.

export type ResumeReason = "visible" | "online";

export type ResumeGate = {
  hidden(): void;
  visible(): ResumeReason | null;
  online(): ResumeReason | null;
};

export function createResumeGate(opts: {
  now: () => number;
  minHiddenMs?: number;
  dedupeMs?: number;
}): ResumeGate {
  const minHiddenMs = opts.minHiddenMs ?? 2000;
  const dedupeMs = opts.dedupeMs ?? 1000;
  let hiddenAt: number | null = null;
  let lastFiredAt = -Infinity;

  const fire = (reason: ResumeReason): ResumeReason | null => {
    const t = opts.now();
    if (t - lastFiredAt < dedupeMs) return null;
    lastFiredAt = t;
    return reason;
  };

  return {
    hidden() {
      if (hiddenAt === null) hiddenAt = opts.now();
    },
    visible() {
      const since = hiddenAt;
      hiddenAt = null;
      if (since === null) return null;
      if (opts.now() - since < minHiddenMs) return null;
      return fire("visible");
    },
    online() {
      return fire("online");
    },
  };
}
