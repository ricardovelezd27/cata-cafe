"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCoffeeInvite, revokeCoffeeShare, rotateCoffeeInvite } from "@/app/actions/coffees";
import { useActionFeedback } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { buildCoffeeInviteUrl } from "@/lib/inviteUrl";

type Share = { userId: string; displayName: string };

type Props = {
  coffeeId: string;
  locale: string;
  initialToken: string | null;
  /** ISO expiry of the current link; null for a legacy link that never expires. */
  initialExpiresAt?: string | null;
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
    /** "El enlace vence el {date}" — raw template. */
    expiresOn: string;
    noExpiry: string;
    rotate: string;
    rotateTitle: string;
    rotateBody: string;
    rotateConfirm: string;
    revokeTitle: string;
    /** "{name} perderá el acceso…" — raw template. */
    revokeBody: string;
    revokeAlsoRotate: string;
    revokeConfirm: string;
    dialogCancel: string;
    dialogClose: string;
  };
};

// Deterministic on server and client (UTC) so the expiry never flickers on hydration.
function formatExpiry(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Owner-only card content on the coffee profile page: generate/copy a share
// link and manage who currently holds access. Mirrors the invite-link step of
// NewSessionForm.tsx (copy-to-clipboard pattern) and the commit/router.refresh
// pattern from CoffeeVisibilityToggle.tsx.
export function CoffeeShareManager({
  coffeeId,
  locale,
  initialToken,
  initialExpiresAt = null,
  shares,
  translations: t,
}: Props) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const [token, setToken] = useState<string | null>(initialToken);
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [askRotate, setAskRotate] = useState(false);
  const [askRevoke, setAskRevoke] = useState<Share | null>(null);
  // Default ON: a revoke that leaves the link alive is the bug being fixed.
  const [alsoRotate, setAlsoRotate] = useState(true);

  const inviteUrl =
    token && typeof window !== "undefined"
      ? buildCoffeeInviteUrl(window.location.origin, locale, token)
      : "";

  function handleGenerate() {
    startTransition(async () => {
      await feedback.run(createCoffeeInvite(coffeeId), (data) => {
        setToken(data.token);
        setExpiresAt(data.expiresAt);
        router.refresh();
      });
    });
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function confirmRotate() {
    const res = await feedback.run(rotateCoffeeInvite(coffeeId), (data) => {
      setToken(data.token);
      setExpiresAt(data.expiresAt);
      router.refresh();
    });
    return res.ok ? undefined : res;
  }

  async function confirmRevoke() {
    if (!askRevoke) return { ok: false };
    const target = askRevoke;
    setRevokingId(target.userId);
    try {
      const res = await feedback.run(
        revokeCoffeeShare(coffeeId, target.userId, alsoRotate),
        (fresh) => {
          if (fresh) {
            setToken(fresh.token);
            setExpiresAt(fresh.expiresAt);
          }
          router.refresh();
        },
      );
      return res.ok ? undefined : res;
    } finally {
      setRevokingId(null);
    }
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
          <button
            type="button"
            onClick={() => setAskRotate(true)}
            className="rounded-pill border border-outline-variant text-xs font-semibold px-3 py-1.5 hover:bg-surface-container whitespace-nowrap"
          >
            {t.rotate}
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

      {token && (
        <p className="text-xs text-on-surface-variant">
          {expiresAt ? t.expiresOn.replace("{date}", formatExpiry(expiresAt, locale)) : t.noExpiry}
        </p>
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
                  onClick={() => {
                    setAlsoRotate(true);
                    setAskRevoke(s);
                  }}
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

      <ConfirmDialog
        open={askRotate}
        onOpenChange={setAskRotate}
        title={t.rotateTitle}
        body={t.rotateBody}
        confirmLabel={t.rotateConfirm}
        cancelLabel={t.dialogCancel}
        closeLabel={t.dialogClose}
        destructive={false}
        onConfirm={confirmRotate}
      />
      <ConfirmDialog
        open={askRevoke !== null}
        onOpenChange={(o) => {
          if (!o) setAskRevoke(null);
        }}
        title={t.revokeTitle}
        body={
          <div className="space-y-3">
            <p>{t.revokeBody.replace("{name}", askRevoke?.displayName ?? "")}</p>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-on-surface">
              <input
                type="checkbox"
                checked={alsoRotate}
                onChange={(e) => setAlsoRotate(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary-container"
              />
              <span>{t.revokeAlsoRotate}</span>
            </label>
          </div>
        }
        confirmLabel={t.revokeConfirm}
        cancelLabel={t.dialogCancel}
        closeLabel={t.dialogClose}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
