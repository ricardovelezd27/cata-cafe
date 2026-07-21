// Built fresh for the Groups feature — visually similar to the team page's
// CupperCard (components consuming lib/coCuppers.ts) but intentionally not
// imported from app/[locale]/app/team/page.tsx, which is owned by another
// chunk of this plan.

import { Avatar } from "@/components/ui/Avatar";
import type { CoCupperCandidate } from "@/lib/coCuppers";
import { AddToGroupButton, type GroupOption } from "./AddToGroupButton";

const ROLE_LABELS: Record<string, string> = {
  cupping_pro: "Catador Pro",
  q_grader: "Q Grader",
  barista: "Barista",
  roaster: "Tostador",
  producer: "Productor",
};

function formatRelativeDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months === 1) return "hace 1 mes";
  if (months < 12) return `hace ${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? "hace 1 año" : `hace ${years} años`;
}

export function CoCupperCard({
  cupper,
  groups,
  t,
}: {
  cupper: CoCupperCandidate;
  groups: GroupOption[];
  t: {
    addToGroup: string;
    newGroupOption: string;
    namePlaceholder: string;
    create: string;
    added: string;
    errorGeneric: string;
  };
}) {
  const roleLabel = ROLE_LABELS[cupper.role] ?? cupper.role;

  return (
    <div className="bg-white rounded-xl border border-[#E8E0D0] p-5 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={cupper.displayName} size={56} />
        <div className="min-w-0">
          <p className="font-semibold text-[15px] text-brown-dark truncate">
            {cupper.displayName}
          </p>
          <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-[#F0EBE1] text-brown-mid">
            {roleLabel}
          </span>
        </div>
      </div>

      <hr className="border-[#E8E0D0]" />

      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-brown-dark">
          <span className="font-semibold">{cupper.sessionCount}</span>{" "}
          {cupper.sessionCount === 1 ? "sesión" : "sesiones"} ·{" "}
          <span className="font-semibold">{cupper.evaluationCount}</span>{" "}
          {cupper.evaluationCount === 1 ? "cata" : "catas"}
        </p>
        <p className="text-xs text-brown-mid">
          Última sesión: {formatRelativeDate(cupper.lastSessionDate)} —{" "}
          <span className="italic">{cupper.lastSessionName}</span>
        </p>
      </div>

      <AddToGroupButton candidateUserId={cupper.userId} groups={groups} t={t} />
    </div>
  );
}
