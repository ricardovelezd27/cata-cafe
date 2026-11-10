// Server-only email abstraction. Sends transactional email through the Resend
// HTTP API via a plain `fetch` (no SDK / no new npm dependency).
//
// NEVER import this from a client component — it reads server secrets
// (RESEND_API_KEY) and is only ever called from server actions / server-side
// modules (lib/closeEmail.ts).
//
// Graceful degradation: when RESEND_API_KEY is unset, sending is disabled — we
// log one warning and return { ok: false, skipped: true } instead of throwing,
// so environments without an email key (local dev, previews) never break the
// flows that call this.

export type EmailAttachment = {
  filename: string;
  content: Buffer;
};

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  /** Sent as the Resend `Idempotency-Key` header so a retried request cannot
   *  deliver twice. Unset → no header (closeEmail / digest are unchanged). */
  idempotencyKey?: string;
  /** Extra message headers (e.g. List-Unsubscribe), passed to Resend's `headers`. */
  headers?: Record<string, string>;
};

/** Coarse failure class, so callers can decide to retry without ever reading
 *  the provider response body (which can echo an address). */
export type SendEmailErrorCode = "resend_429" | "resend_5xx" | "resend_4xx" | "network";

export type SendEmailResult = {
  ok: boolean;
  /** true when sending was skipped because email is not configured. */
  skipped?: boolean;
  error?: string;
  /** HTTP status of a failed Resend call. */
  status?: number;
  /** Parsed `Retry-After` of a failed call, in ms. */
  retryAfterMs?: number;
  code?: SendEmailErrorCode;
};

/** Failure class for an HTTP status. */
export function classifyResendStatus(status: number): SendEmailErrorCode {
  if (status === 429) return "resend_429";
  return status >= 500 ? "resend_5xx" : "resend_4xx";
}

/** `Retry-After` (delta-seconds) → ms; undefined when absent or not a number. */
export function parseRetryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Escapes HTML-special characters for safe interpolation into email templates. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Default sender; override with EMAIL_FROM. Must be a Resend-verified domain. */
const DEFAULT_FROM = "Cata Café <no-reply@catacafe.app>";

// Warn only once per process about the missing key, so a batch of recipients
// doesn't spam the logs with the same line.
let warnedMissingKey = false;

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn(
        "[email] RESEND_API_KEY is not set — email sending is disabled (no-op).",
      );
      warnedMissingKey = true;
    }
    return { ok: false, skipped: true };
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  const payload: Record<string, unknown> = {
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
  };
  if (args.headers && Object.keys(args.headers).length > 0) payload.headers = args.headers;
  if (args.attachments && args.attachments.length > 0) {
    payload.attachments = args.attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    }));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (args.idempotencyKey) headers["Idempotency-Key"] = args.idempotencyKey;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend responded ${res.status}: ${body.slice(0, 500)}`,
        status: res.status,
        retryAfterMs: parseRetryAfterMs(res.headers.get("retry-after")),
        code: classifyResendStatus(res.status),
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      code: "network",
    };
  }
}
