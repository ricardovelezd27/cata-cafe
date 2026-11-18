"use client";

// Shown to a signed-in MEMBER who unsubscribed from this group's emails (S8-20,
// F-grupos-8). The unsubscribe link only switches mail off; this is the way back.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { setGroupEmailOptOut } from "@/app/actions/groups";
import { useActionFeedback } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

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

  // P2a: a notice, not a card (DESIGN.md "A notice is not a card"). Part of the page
  // from the start, so it is not announced (`live={false}`).
  return (
    <Notice
      tone="info"
      live={false}
      action={
        <Button variant="secondary" size="sm" onClick={resume} disabled={pending} icon={<MailCheck size={16} aria-hidden />}>
          {t.resume}
        </Button>
      }
    >
      {t.note}
    </Notice>
  );
}
