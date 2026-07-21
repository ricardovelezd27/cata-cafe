"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/actions/profile";

export function ProfileForm({
  initial,
  t,
}: {
  initial: { displayName: string; preferredLang: "es" | "en"; bio: string };
  t: { displayName: string; preferredLang: string; bio: string; save: string };
}) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [preferredLang, setPreferredLang] = useState<"es" | "en">(initial.preferredLang);
  const [bio, setBio] = useState(initial.bio);
  const [pending, start] = useTransition();

  const inputCls =
    "w-full px-3 py-2 border border-[#D4C5A9] rounded-input text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark";
  const labelCls = "block text-xs text-brown-mid font-semibold uppercase tracking-wide mb-1";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await updateProfile({ displayName, preferredLang, bio });
        });
      }}
      className="space-y-4"
    >
      <div>
        <label className={labelCls}>{t.displayName}</label>
        <input
          className={inputCls}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div>
        <label className={labelCls}>{t.preferredLang}</label>
        <select
          className={inputCls}
          value={preferredLang}
          onChange={(e) => setPreferredLang(e.target.value as "es" | "en")}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>{t.bio}</label>
        <textarea
          className={inputCls + " min-h-[80px]"}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="px-5 py-2 rounded-pill bg-green-dark text-white font-bold disabled:opacity-50"
      >
        {t.save}
      </button>
    </form>
  );
}
