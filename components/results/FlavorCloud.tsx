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
      <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
        Perfil de Sabor
      </div>
      <div className="flex flex-wrap gap-1.5">
        {resolved.map((d) => {
          const isStar = d.id === starId
          return (
            <span key={d.id} className="relative inline-flex flex-col items-center gap-0.5">
              <span
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-1 font-sans text-xs leading-none text-white ${
                  isStar ? 'font-bold' : 'font-medium'
                }`}
                style={{
                  backgroundColor: d.color,
                  boxShadow: isStar ? `0 0 0 2px ${d.color}66` : undefined,
                }}
              >
                {isStar && <span className="text-[10px]" aria-hidden>★</span>}
                {d.label}
              </span>
              {isGroup && totalEvaluators > 0 && d.count > 0 && (
                <span
                  className="font-mono text-[9px] font-semibold tracking-wide"
                  style={{ color: d.color }}
                >
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
