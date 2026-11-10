"use client";

// Shown to a signed-in MEMBER who unsubscribed from this group's emails (S8-20,
// F-grupos-8). The unsubscribe link only switches mail off; this is the way back.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { setGroupEmailOptOut } from "@/app/actions/groups";
import { useActionFeedback } from "@/components/ui/Toast";

export type GroupEmailOptOutTranslations = {
  note: string;
  resume: string;
};

export function GroupEmailOptOutNotice({
  groupId,
  t,
}: {
  groupId: string;
  t: GroupEmailOptOutTranslations;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const [pending, start] = useTransition();

  const resume = () =>
    start(async () => {
      await feedback.run(setGroupEmailOptOut(groupId, false), () => router.refresh());
    });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
      <p className="min-w-0 flex-1">{t.note}</p>
      <button
        type="button"
        onClick={resume}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-pill border border-outline-variant px-4 py-2 text-sm font-medium text-primary-container transition-colors hover:bg-surface-container-high disabled:opacity-50"
      >
        <MailCheck size={16} aria-hidden /> {t.resume}
      </button>
    </div>
  );
}
