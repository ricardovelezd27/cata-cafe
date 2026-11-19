'use client'

import {
  FLAVOR_DESC_KEYS,
  collectDescriptors,
  resolveDescriptor,
} from '@/lib/descriptors'

interface FlavorCloudProps {
  descriptive: Record<string, unknown>
  allDescriptive?: Record<string, unknown>[]
  isGroup?: boolean
  locale?: "es" | "en"
}

interface ResolvedDescriptor {
  id: string
  label: string
  color: string
  count: number
}

export function FlavorCloud({ descriptive, allDescriptive, isGroup, locale = "es" }: FlavorCloudProps) {
  const myIds = collectDescriptors(descriptive, FLAVOR_DESC_KEYS)

  // Build frequency map for group view
  const frequencyMap = new Map<string, number>()
  if (isGroup && allDescriptive && allDescriptive.length > 0) {
    for (const evDesc of allDescriptive) {
      for (const id of collectDescriptors(evDesc, FLAVOR_DESC_KEYS)) {
        frequencyMap.set(id, (frequencyMap.get(id) ?? 0) + 1)
      }
    }
  }

  if (myIds.length === 0) return null

  // Build resolved list sorted by: selected first, then by count desc
  const resolved: ResolvedDescriptor[] = myIds
    .map((id) => {
      const info = resolveDescriptor(id, locale)
      if (!info) return null
      return { id, label: info.label, color: info.color, count: frequencyMap.get(id) ?? 0 }
    })
    .filter((d): d is ResolvedDescriptor => d !== null)
    .sort((a, b) => b.count - a.count)

  const maxCount = resolved.length > 0 ? Math.max(...resolved.map((d) => d.count)) : 0
  const starId = isGroup && maxCount > 0 ? resolved.find((d) => d.count === maxCount)?.id : null

  const totalEvaluators = allDescriptive?.length ?? 0

  return (
    <div className="mt-3">
      <div className="label-caps mb-2">
        Perfil de Sabor
      </div>
      <div className="flex flex-wrap gap-1.5">
        {resolved.map((d) => {
          const isStar = d.id === starId
          return (
            <span key={d.id} className="relative inline-flex flex-col items-center gap-0.5">
              {/* H-01 (Q2): DESIGN.md: a family's colour is a dot beside a word in ink, never
                  the text's colour or a pill's fill (white on these tones was 1.97 to 4.11 : 1). */}
              <span
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border bg-surface-container-lowest px-2.5 py-1 font-sans text-caption leading-none text-on-surface ${
                  isStar ? 'border-on-surface-variant font-bold' : 'border-outline-variant font-medium'
                }`}
              >
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                {isStar && <span className="text-caption" aria-hidden>★</span>}
                {d.label}
              </span>
              {isGroup && totalEvaluators > 0 && d.count > 0 && (
                <span className="font-mono text-caption font-semibold tracking-wide text-on-surface-variant">
                  {d.count}/{totalEvaluators}
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
