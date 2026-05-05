'use client'

import { FLAVOR_FAMILIES } from '@/lib/constants'

const DESCRIPTOR_KEYS = [
  'fragancia_desc',
  'aroma_desc',
  'sabor_desc',
  'sabor_residual_desc',
] as const

interface FlavorCloudProps {
  descriptive: Record<string, unknown>
  allDescriptive?: Record<string, unknown>[]
  isGroup?: boolean
}

interface ResolvedDescriptor {
  id: string
  label: string
  color: string
  count: number
}

function resolveDescriptor(id: string): { label: string; color: string } | null {
  // Sub-item IDs have format "familyId:subSlug"
  if (id.includes(':')) {
    const familyId = id.split(':')[0]
    const family = FLAVOR_FAMILIES.find((f) => f.id === familyId)
    if (!family) return null
    const sub = family.subItems.find((s) => s.id === id)
    return sub ? { label: sub.label, color: family.color } : null
  }
  // Family-level ID
  const family = FLAVOR_FAMILIES.find((f) => f.id === id)
  return family ? { label: family.label, color: family.color } : null
}

function collectDescriptors(descriptive: Record<string, unknown>): string[] {
  const seen = new Set<string>()
  for (const key of DESCRIPTOR_KEYS) {
    const arr = descriptive[key]
    if (Array.isArray(arr)) {
      for (const id of arr) {
        if (typeof id === 'string') seen.add(id)
      }
    }
  }
  return Array.from(seen)
}

export function FlavorCloud({ descriptive, allDescriptive, isGroup }: FlavorCloudProps) {
  const myIds = collectDescriptors(descriptive)

  // Build frequency map for group view
  const frequencyMap = new Map<string, number>()
  if (isGroup && allDescriptive && allDescriptive.length > 0) {
    for (const evDesc of allDescriptive) {
      for (const id of collectDescriptors(evDesc)) {
        frequencyMap.set(id, (frequencyMap.get(id) ?? 0) + 1)
      }
    }
  }

  if (myIds.length === 0) return null

  // Build resolved list sorted by: selected first, then by count desc
  const resolved: ResolvedDescriptor[] = myIds
    .map((id) => {
      const info = resolveDescriptor(id)
      if (!info) return null
      return { id, label: info.label, color: info.color, count: frequencyMap.get(id) ?? 0 }
    })
    .filter((d): d is ResolvedDescriptor => d !== null)
    .sort((a, b) => b.count - a.count)

  const maxCount = resolved.length > 0 ? Math.max(...resolved.map((d) => d.count)) : 0
  const starId = isGroup && maxCount > 0 ? resolved.find((d) => d.count === maxCount)?.id : null

  const totalEvaluators = allDescriptive?.length ?? 0

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--color-brown-mid)',
          marginBottom: 8,
          fontWeight: 500,
        }}
      >
        Perfil de Sabor
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {resolved.map((d) => {
          const isStar = d.id === starId
          return (
            <span key={d.id} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 11px',
                  borderRadius: 999,
                  backgroundColor: d.color,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: isStar ? 700 : 500,
                  fontFamily: 'var(--font-ui)',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  boxShadow: isStar ? `0 0 0 2px ${d.color}66` : undefined,
                }}
              >
                {isStar && <span style={{ fontSize: 10 }}>★</span>}
                {d.label}
              </span>
              {isGroup && totalEvaluators > 0 && d.count > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: d.color,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
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
