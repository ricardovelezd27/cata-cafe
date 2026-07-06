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
};

export type SendEmailResult = {
  ok: boolean;
  /** true when sending was skipped because email is not configured. */
  skipped?: boolean;
  error?: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

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
  if (args.attachments && args.attachments.length > 0) {
    payload.attachments = args.attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    }));
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend responded ${res.status}: ${body.slice(0, 500)}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
