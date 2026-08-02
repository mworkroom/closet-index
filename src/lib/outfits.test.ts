import { describe, expect, it } from 'vitest'
import type { Outfit, WearLog } from './types'
import { getItemStats } from './outfits'

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
    rainCondition: 'unknown',
    longWalkCondition: 'unknown',
    placeId: null,
    transportModeId: null,
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
      previewState: 'missing',
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
