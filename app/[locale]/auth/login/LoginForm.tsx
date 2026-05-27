"use client";

import { useState } from "react";
import { signInWithMagicLink, signInWithGoogle } from "@/app/actions/auth";

export function LoginForm({
  emailLabel,
  sendLabel,
  sendingLabel,
  sentLabel,
  errorLabel,
  rateLimitErrorLabel,
  googleLabel,
  orLabel,
  subtitleLabel,
  next,
}: {
  emailLabel: string;
  sendLabel: string;
  sendingLabel: string;
  sentLabel: string;
  errorLabel: string;
  rateLimitErrorLabel: string;
  googleLabel: string;
  orLabel: string;
  subtitleLabel: string;
  next?: string;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "rate_limit">("idle");
  const [email, setEmail] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const fd = new FormData(e.currentTarget);
    const result = await signInWithMagicLink(fd, next);
    if (result.ok) {
      setStatus("sent");
    } else if (result.error?.toLowerCase().includes("rate limit")) {
      setStatus("rate_limit");
    } else {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return <div className="text-green-dark text-sm">{sentLabel}</div>;
  }

  return (
    <div className="space-y-4">
      <form action={() => signInWithGoogle(next)}>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg border border-[#D4C5A9] bg-white text-brown-dark font-semibold text-sm hover:bg-[#F5F0E8] transition"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
            <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z"/>
            <path fill="#FBBC05" d="M24 46c5.9 0 10.9-2 14.5-5.4l-6.7-5.5C29.8 36.8 27 38 24 38c-6.1 0-10.7-3.1-11.8-7.5l-7 5.4C8.6 42.3 15.7 46 24 46z"/>
            <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.6 2.9-2.3 5.3-4.7 6.9l6.7 5.5C41.8 37.4 45 31.2 45 24c0-1.3-.2-2.7-.5-4z"/>
          </svg>
          {googleLabel}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#D4C5A9]" />
        <span className="text-xs text-brown-mid">{orLabel}</span>
        <div className="flex-1 h-px bg-[#D4C5A9]" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-brown-mid">{subtitleLabel}</p>
      <label className="block">
        <span className="text-xs text-brown-mid font-semibold uppercase tracking-wide">
          {emailLabel}
        </span>
        <input
          type="email"
          name="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          className="mt-1 w-full px-3 py-2 border border-[#D4C5A9] rounded-lg text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full py-2.5 rounded-lg bg-green-dark text-white font-bold hover:bg-green-mid transition disabled:opacity-50"
      >
        {status === "sending" ? sendingLabel : sendLabel}
      </button>
      {status === "error" && <div className="text-red-defect text-sm">{errorLabel}</div>}
      {status === "rate_limit" && <div className="text-red-defect text-sm">{rateLimitErrorLabel}</div>}
    </form>
    </div>
  );
}
