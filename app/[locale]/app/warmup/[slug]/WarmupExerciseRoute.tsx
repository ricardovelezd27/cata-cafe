"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { warmupById } from "@/lib/warmup/exercises";
import { WarmupPlayer, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";

/** Library route body: back link + the player inline (full-screen below md). */
export function WarmupExerciseRoute({
  exerciseId,
  locale,
  strings,
  backLabel,
  listHref,
}: {
  exerciseId: string;
  locale: string;
  strings: WarmupPlayerStrings;
  backLabel: string;
  listHref: string;
}) {
  const router = useRouter();
  const exercise = warmupById(exerciseId);
  if (!exercise) return null;
  const leave = () => router.push(listHref);
  return (
    <div className="space-y-4 max-w-5xl">
      <Link
        href={listHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <ChevronLeft size={16} aria-hidden />
        {backLabel}
      </Link>
      <WarmupPlayer exercise={exercise} locale={locale} t={strings} inline onFinish={leave} onSkip={leave} />
    </div>
  );
}
