import type { SelectOption } from './types'

export const WALK_SHORT_TRANSPORT_LABEL = '도보 · 근거리'
export const WALK_SUSTAINED_TRANSPORT_LABEL = '도보 · 지속'
export const LEGACY_WALK_TRANSPORT_LABEL = '도보 · 기존 기록'

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('ko-KR')
}

export function isLegacyWalkTransportName(name: string) {
  const value = normalized(name)
  return value === '도보' || value === 'walk'
}

export function isLegacyWalkTransportId(
  modes: readonly SelectOption[],
  id: string | null | undefined,
) {
  if (!id) return false
  return modes.some(
    (mode) => mode.id === id && isLegacyWalkTransportName(mode.name),
  )
}

export function transportDisplayName(mode: SelectOption) {
  return isLegacyWalkTransportName(mode.name)
    ? LEGACY_WALK_TRANSPORT_LABEL
    : mode.name
}

function transportPriority(name: string) {
  const value = normalized(name)
  if (value === normalized(WALK_SHORT_TRANSPORT_LABEL)) return 0
  if (value === normalized(WALK_SUSTAINED_TRANSPORT_LABEL)) return 1
  if (value === normalized(LEGACY_WALK_TRANSPORT_LABEL)) return 2
  if (value === '차' || value === 'car') return 3
  if (value === '지하철' || value === 'subway') return 4
  if (value === '버스' || value === 'bus') return 5
  return 6
}

export function transportOptionsForSelection(
  modes: readonly SelectOption[],
  legacySelectedId?: string | null,
) {
  return modes
    .flatMap((mode) => {
      if (!isLegacyWalkTransportName(mode.name)) return [mode]
      return mode.id === legacySelectedId
        ? [{ ...mode, name: LEGACY_WALK_TRANSPORT_LABEL }]
        : []
    })
    .sort(
      (left, right) =>
        transportPriority(left.name) - transportPriority(right.name) ||
        left.name.localeCompare(right.name, 'ko-KR') ||
        left.id.localeCompare(right.id),
    )
}
