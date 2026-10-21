"use client";

import { Badge } from "@/components/ui";
import { Notes } from "@/components/ui/Notes";
import { EXPRESS_NOTE_MAX } from "@/lib/expressSession";

export type ExpressNotesStepTranslations = {
  title: string;
  body: string;
  placeholder: string;
  referenceBadge: string;
  optional: string;
};

export type ExpressNotesSample = { id: string; label: string; isReference: boolean };

export function ExpressNotesStep({
  samples,
  values,
  onChange,
  translations,
  maxLength = EXPRESS_NOTE_MAX,
}: {
  samples: ExpressNotesSample[];
  values: Record<string, string>;
  onChange: (sampleId: string, text: string) => void;
  translations: ExpressNotesStepTranslations;
  maxLength?: number;
}) {
  const { title, body, placeholder, referenceBadge, optional } = translations;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl text-primary-container">{title}</h2>
          <Badge tone="neutral" size="xs">
            {optional}
          </Badge>
        </div>
        <p className="text-sm text-on-surface-variant">{body}</p>
      </div>
      <ol className="space-y-3">
        {samples.map((s) => {
          const text = values[s.id] ?? "";
          return (
            <li
              key={s.id}
              className="rounded-card border border-outline-variant bg-surface-container-lowest p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-semibold text-on-surface">{s.label}</span>
                {s.isReference && (
                  <Badge tone="accent" size="xs">
                    {referenceBadge}
                  </Badge>
                )}
              </div>
              <Notes
                value={text}
                onChange={(v) => onChange(s.id, v)}
                placeholder={placeholder}
                rows={3}
                maxLength={maxLength}
                ariaLabel={`${title} · ${s.label}`}
              />
              <p className="mt-1 text-right text-[11px] text-on-surface-variant tabular-nums">
                {text.length}/{maxLength}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
