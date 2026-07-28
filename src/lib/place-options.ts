import type { SelectOption } from './types'

const preferredPlaceNames = [
  'CGV용산',
  'CGV방학',
  '롯데노원',
  '스타벅스 창동역 TO',
  '스타벅스 창동역 카뜨',
] as const

const preferredPlaceRank = new Map<string, number>(
  preferredPlaceNames.map((name, index) => [name, index]),
)

export function sortPlacesForSelection(places: SelectOption[]) {
  return [...places].sort((a, b) => {
    const aRank = preferredPlaceRank.get(a.name)
    const bRank = preferredPlaceRank.get(b.name)

    if (aRank !== undefined || bRank !== undefined) {
      if (aRank === undefined) return 1
      if (bRank === undefined) return -1
      return aRank - bRank
    }

    const aStartsWithLatin = /^[A-Za-z]/.test(a.name)
    const bStartsWithLatin = /^[A-Za-z]/.test(b.name)
    if (aStartsWithLatin !== bStartsWithLatin) {
      return aStartsWithLatin ? -1 : 1
    }

    return a.name.localeCompare(b.name, 'ko')
  })
}
