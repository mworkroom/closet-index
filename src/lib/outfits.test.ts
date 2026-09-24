import { describe, expect, it } from 'vitest'
import type { Outfit, WearLog } from './types'
import { getItemStats, getOutfitStats } from './outfits'

function wearLog(id: string, outfitId: string, wornOn: string): WearLog {
  return {
    id,
    outfitId,
    wornOn,
    tempOut: null,
    tempBack: null,
    tempBackInferred: false,
    feelingOut: null,
    feelingBack: null,
    rainCondition: 'no',
    longWalkCondition: 'no',
    placeId: null,
    transportModeId: null,
    observedHvacMode: 'off',
    observedHvacIntensity: null,
    memo: null,
    temperatureSource: 'manual',
    weatherLocationId: null,
    weatherIssuedAt: null,
    weatherOverridden: false,
    submissionToken: `token-${id}`,
    createdAt: `${wornOn}T12:00:00+09:00`,
  }
}

describe('getItemStats monthly wear history', () => {
  it('keeps every log and aggregates all years into 12 calendar months', () => {
    const outfit: Outfit = {
      id: 'outfit-a',
      displayName: null,
      rating: null,
      itemIds: ['item-a'],
    }
    const logs = Array.from({ length: 12 }, (_, index) =>
      wearLog(
        `log-${index + 1}`,
        outfit.id,
        `2025-${String(index + 1).padStart(2, '0')}-10`,
      ),
    )
    logs.push(wearLog('log-january-extra', outfit.id, '2026-01-20'))

    expect(getItemStats('item-a', [outfit], logs)).toEqual({
      wearCount: 13,
      firstWornOn: '2025-01-10',
      lastWornOn: '2026-01-20',
      monthlyWearCounts: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      wornMonthCount: 12,
      isYearRound: true,
    })
  })
})

describe('getOutfitStats observed wear history', () => {
  it('첫 착용일과 OK로 기록된 실제 온도만 집계한다', () => {
    const logs = [
      { ...wearLog('latest', 'outfit-a', '2026-09-15'), tempOut: 25, feelingOut: 'hot' as const },
      { ...wearLog('first', 'outfit-a', '2026-08-30'), tempOut: 17, feelingOut: 'ok' as const, tempBack: 19, feelingBack: 'ok' as const },
      { ...wearLog('other', 'outfit-b', '2026-07-01'), tempOut: 1, feelingOut: 'ok' as const },
    ]

    expect(getOutfitStats('outfit-a', logs)).toEqual({
      wearCount: 2,
      firstWornOn: '2026-08-30',
      lastWornOn: '2026-09-15',
      okRange: { min: 17, max: 19 },
    })
    expect(getOutfitStats('never-worn', logs)).toEqual({
      wearCount: 0,
      firstWornOn: null,
      lastWornOn: null,
      okRange: null,
    })
  })
})
