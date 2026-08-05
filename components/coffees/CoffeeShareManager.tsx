"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCoffeeInvite, revokeCoffeeShare } from "@/app/actions/coffees";
import { buildCoffeeInviteUrl } from "@/lib/inviteUrl";

type Share = { userId: string; displayName: string };

type Props = {
  coffeeId: string;
  locale: string;
  initialToken: string | null;
  shares: Share[];
  translations: {
    title: string;
    generateLink: string;
    generating: string;
    copyLink: string;
    copied: string;
    peopleWithAccess: string;
    noShares: string;
    revoke: string;
    linkHint: string;
  };
};

// Owner-only card content on the coffee profile page: generate/copy a share
// link and manage who currently holds access. Mirrors the invite-link step of
// NewSessionForm.tsx (copy-to-clipboard pattern) and the commit/router.refresh
// pattern from CoffeeVisibilityToggle.tsx.
export function CoffeeShareManager({
  coffeeId,
  locale,
  initialToken,
  shares,
  translations: t,
}: Props) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(initialToken);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inviteUrl =
    token && typeof window !== "undefined"
      ? buildCoffeeInviteUrl(window.location.origin, locale, token)
      : "";

  function handleGenerate() {
    startTransition(async () => {
      const result = await createCoffeeInvite(coffeeId);
      setToken(result.token);
      router.refresh();
    });
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleRevoke(userId: string) {
    setRevokingId(userId);
    startTransition(async () => {
      await revokeCoffeeShare(coffeeId, userId);
      router.refresh();
      setRevokingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-primary-container font-semibold">{t.title}</h2>

      {token ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.target.select()}
            className="flex-1 border border-outline-variant rounded-input px-3 py-2 text-xs font-mono truncate bg-surface-container-lowest"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-pill border border-outline-variant text-xs font-semibold px-3 py-1.5 hover:bg-surface-container whitespace-nowrap"
          >
            {copied ? t.copied : t.copyLink}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={handleGenerate}
          className="rounded-pill bg-primary-container text-white text-xs font-semibold px-3 py-1.5 hover:bg-green-mid transition disabled:opacity-60"
        >
          {isPending ? t.generating : t.generateLink}
        </button>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          {t.peopleWithAccess}
        </p>
        {shares.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t.noShares}</p>
        ) : (
          <ul className="space-y-1.5">
            {shares.map((s) => (
              <li
                key={s.userId}
                className="flex items-center justify-between gap-3 text-sm text-on-surface"
              >
                <span>{s.displayName}</span>
                <button
                  type="button"
                  disabled={isPending && revokingId === s.userId}
                  onClick={() => handleRevoke(s.userId)}
                  className="rounded-pill border border-outline-variant text-xs font-semibold px-3 py-1.5 hover:bg-surface-container disabled:opacity-60"
                >
                  {t.revoke}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-on-surface-variant">{t.linkHint}</p>
    </div>
  );
}
