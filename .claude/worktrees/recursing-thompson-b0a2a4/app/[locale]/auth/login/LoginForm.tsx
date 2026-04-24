"use client";

import { useState } from "react";
import { signInWithMagicLink } from "@/app/actions/auth";

export function LoginForm({
  emailLabel,
  sendLabel,
  sendingLabel,
  sentLabel,
  errorLabel,
  next,
}: {
  emailLabel: string;
  sendLabel: string;
  sendingLabel: string;
  sentLabel: string;
  errorLabel: string;
  next?: string;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [email, setEmail] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const fd = new FormData(e.currentTarget);
    const result = await signInWithMagicLink(fd, next);
    setStatus(result.ok ? "sent" : "error");
  }

  if (status === "sent") {
    return <div className="text-green-dark text-sm">{sentLabel}</div>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="text-xs text-brown-mid font-semibold uppercase tracking-wide">
          {emailLabel}
        </span>
        <input
          type="email"
          name="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
    </form>
  );
}
