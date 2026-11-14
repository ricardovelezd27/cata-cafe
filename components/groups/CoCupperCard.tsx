// Built fresh for the Groups feature — visually similar to the team page's
// CupperCard (components consuming lib/coCuppers.ts) but intentionally not
// imported from app/[locale]/app/team/page.tsx, which is owned by another
// chunk of this plan.

import { Avatar } from "@/components/ui/Avatar";
import type { CoCupperCandidate } from "@/lib/coCuppers";
import { ROLE_LABELS } from "@/lib/constants";
import { formatRelativeDate, type RelativeDateLabels } from "@/lib/relativeDate";
import { AddToGroupButton, type GroupOption } from "./AddToGroupButton";

export function CoCupperCard({
  cupper,
  groups,
  locale,
  t,
}: {
  cupper: CoCupperCandidate;
  groups: GroupOption[];
  locale: string;
  t: {
    addToGroup: string;
    newGroupOption: string;
    namePlaceholder: string;
    create: string;
    added: string;
    errorGeneric: string;
    sessionOne: string;
    sessionMany: string;
    evaluationOne: string;
    evaluationMany: string;
    lastSession: string;
    relative: RelativeDateLabels;
  };
}) {
  // Role names come from the shared ROLE_LABELS in the page's locale; every other
  // string comes in through `t` (S10 WP6 A4).
  const roleLabel = ROLE_LABELS[cupper.role]?.[locale === "en" ? "en" : "es"] ?? cupper.role;

  return (
    <div className="bg-surface-container-lowest rounded-card border border-outline-variant p-5 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={cupper.displayName} size={56} />
        <div className="min-w-0">
          <p className="font-semibold text-[15px] text-on-surface truncate">
            {cupper.displayName}
          </p>
          <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-[#F0EBE1] text-on-surface-variant">
            {roleLabel}
          </span>
        </div>
      </div>

      <hr className="border-outline-variant" />

      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-on-surface">
          <span className="font-semibold">{cupper.sessionCount}</span>{" "}
          {cupper.sessionCount === 1 ? t.sessionOne : t.sessionMany} ·{" "}
          <span className="font-semibold">{cupper.evaluationCount}</span>{" "}
          {cupper.evaluationCount === 1 ? t.evaluationOne : t.evaluationMany}
        </p>
        <p className="text-xs text-on-surface-variant">
          {t.lastSession} {formatRelativeDate(cupper.lastSessionDate, t.relative)} —{" "}
          <span className="italic">{cupper.lastSessionName}</span>
        </p>
      </div>

      <AddToGroupButton candidateUserId={cupper.userId} groups={groups} t={t} />
    </div>
  );
}
