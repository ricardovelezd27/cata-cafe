"use client";

import { useId, useState, useTransition } from "react";
import { updateProfile } from "@/app/actions/profile";
import { Select } from "@/components/ui/Select";
import { useActionFeedback } from "@/components/ui/Toast";

const inputCls =
  "w-full border border-outline-variant rounded-input px-3 py-2 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";
const labelCls = "block text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-1";

export function ProfileForm({
  initial,
  roleOptions,
  countryOptions,
  t,
}: {
  initial: {
    displayName: string;
    preferredLang: "es" | "en";
    bio: string;
    role: string;
    country: string;
  };
  roleOptions: { value: string; label: string }[];
  countryOptions: string[];
  t: {
    displayName: string;
    preferredLang: string;
    bio: string;
    save: string;
    roleLabel: string;
    countryLabel: string;
    saveSuccess: string;
    saveError: string;
    saving: string;
  };
}) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [preferredLang, setPreferredLang] = useState<"es" | "en">(initial.preferredLang);
  const [bio, setBio] = useState(initial.bio);
  const [role, setRole] = useState(initial.role);
  const [country, setCountry] = useState(initial.country);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [pending, start] = useTransition();
  const feedback = useActionFeedback();
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    role: `${uid}-role`,
    country: `${uid}-country`,
    lang: `${uid}-lang`,
    bio: `${uid}-bio`,
  };

  // The saved profile's country may predate the fixed list (or hold a value
  // outside it) — keep it selectable rather than silently dropping it.
  const countrySelectOptions = [
    { value: "", label: "—" },
    ...(initial.country && !countryOptions.includes(initial.country)
      ? [{ value: initial.country, label: initial.country }]
      : []),
    ...countryOptions.map((c) => ({ value: c, label: c })),
  ];

  function markDirty() {
    setStatus("idle");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setStatus("idle");
        start(async () => {
          // updateProfile returns an ActionResult (S8-07, F-cuenta-8): a
          // failure toasts the localized code AND leaves the inline status.
          const result = await feedback.run(
            updateProfile({
              displayName,
              preferredLang,
              bio,
              role,
              country: country || null,
            }),
          );
          setStatus(result.ok ? "success" : "error");
        });
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor={ids.name} className={labelCls}>
          {t.displayName}
        </label>
        <input
          id={ids.name}
          className={inputCls}
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            markDirty();
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.role} className={labelCls}>
            {t.roleLabel}
          </label>
          <Select
            id={ids.role}
            value={role}
            onChange={(v) => {
              setRole(v);
              markDirty();
            }}
            options={roleOptions}
            ariaLabel={t.roleLabel}
          />
        </div>
        <div>
          <label htmlFor={ids.country} className={labelCls}>
            {t.countryLabel}
          </label>
          <Select
            id={ids.country}
            value={country}
            onChange={(v) => {
              setCountry(v);
              markDirty();
            }}
            options={countrySelectOptions}
            ariaLabel={t.countryLabel}
          />
        </div>
      </div>

      <div>
        <label htmlFor={ids.lang} className={labelCls}>
          {t.preferredLang}
        </label>
        <Select
          id={ids.lang}
          value={preferredLang}
          onChange={(v) => {
            setPreferredLang(v as "es" | "en");
            markDirty();
          }}
          options={[
            { value: "es", label: "Español" },
            { value: "en", label: "English" },
          ]}
          ariaLabel={t.preferredLang}
        />
      </div>

      <div>
        <label htmlFor={ids.bio} className={labelCls}>
          {t.bio}
        </label>
        <textarea
          id={ids.bio}
          className={inputCls + " min-h-[80px]"}
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            markDirty();
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="rounded-pill bg-primary-container px-5 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary disabled:opacity-50"
        >
          {pending ? t.saving : t.save}
        </button>
        {/* One live region for every state, so a screen reader announces the
            result without moving focus. */}
        <span role="status" aria-live="polite" className="text-sm">
          {status === "success" && <span className="text-primary-container">{t.saveSuccess}</span>}
          {status === "error" && <span className="text-error">{t.saveError}</span>}
        </span>
      </div>
    </form>
  );
}
